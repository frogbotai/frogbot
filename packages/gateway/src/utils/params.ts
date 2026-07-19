// Parameter translation utilities for cross-provider middleware.
//
// These utilities handle the impedance mismatch between provider-specific
// parameter formats (OpenAI's `reasoning_effort` vs Anthropic's
// `thinking.budget_tokens`) and common operations like snake_case → camelCase
// conversion for providerOptions namespacing.

import type { ReasoningEffort } from '../shared/types.js';

// ---------------------------------------------------------------------------
// String case conversion
// ---------------------------------------------------------------------------

/** Convert a snake_case string to camelCase. */
export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Convert a camelCase string to snake_case. */
export function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

// ---------------------------------------------------------------------------
// Reasoning budget calculation
// ---------------------------------------------------------------------------

/**
 * Default budget percentages by effort level. Maps the OpenAI-style
 * `reasoning_effort` enum to a fraction of `maxOutputTokens` used as
 * Anthropic's `thinking.budget_tokens`.
 */
const EFFORT_BUDGET_FRACTIONS: Record<string, number> = {
  none: 0,
  minimal: 0.05,
  low: 0.15,
  medium: 0.5,
  high: 0.8,
  xhigh: 0.9,
  max: 1.0,
};

/** Minimum budget tokens when effort > 'none'. Anthropic rejects 0. */
const MIN_BUDGET_TOKENS = 1024;

/** Default max output tokens when none specified. */
const DEFAULT_MAX_OUTPUT_TOKENS = 16384;

/**
 * Calculate Anthropic `thinking.budget_tokens` from an OpenAI-style
 * `reasoning_effort` string.
 *
 * @param effort - One of the `ReasoningEffort` values (case-insensitive).
 * @param maxOutputTokens - The `maxOutputTokens` for the request. Budget is
 *   calculated as a fraction of this. Falls back to 16384 if not provided.
 * @param minBudget - Floor for non-zero budgets (default 1024). Anthropic
 *   rejects budgets below a provider-specific minimum.
 * @returns The budget in tokens, or 0 for `none`.
 */
export function calculateReasoningBudgetFromEffort(
  effort: string,
  maxOutputTokens?: number,
  minBudget: number = MIN_BUDGET_TOKENS,
): number {
  const normalized = effort.toLowerCase();
  const fraction = EFFORT_BUDGET_FRACTIONS[normalized];

  if (fraction === undefined || fraction === 0) return 0;

  const max = maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const raw = Math.round(max * fraction);

  return Math.max(raw, minBudget);
}

// ---------------------------------------------------------------------------
// forwardLanguageParams — namespace remapping for providerOptions
// ---------------------------------------------------------------------------

/**
 * Maps the gateway's registry provider key to the exact camelCase namespace
 * the shipped AI SDK reads from `providerOptions`. The SDK's
 * `parseProviderOptions` looks up `providerOptions[provider]` where `provider`
 * is the package's own namespace string — never the model ID, never a hyphen.
 * Only registry keys whose SDK namespace differs are listed here:
 *
 *   - `amazon-bedrock` builds `@ai-sdk/amazon-bedrock`, which reads
 *     `amazonBedrock` (primary) / `bedrock` (legacy) — never the hyphenated
 *     `amazon-bedrock` string.
 *   - `anthropic-aws` is intentionally absent: it builds `@ai-sdk/anthropic-aws`,
 *     whose Anthropic language model reads providerOptions under both
 *     'anthropic' AND its dynamic provider name 'anthropic-aws' (anthropic-
 *     language-model.ts:193-197, 266-282), so the registry key is itself a
 *     valid, SDK-read namespace.
 *   - `vertex` is intentionally absent: the Vertex language model reads
 *     provider options under `['googleVertex', 'vertex']` (google-language-
 *     model.ts:131-134), so the registry key `vertex` is itself a valid,
 *     SDK-read namespace.
 */
const PROVIDER_OPTIONS_NAMESPACE: Record<string, string> = {
  'amazon-bedrock': 'amazonBedrock',
};

/** Resolve the SDK providerOptions namespace for a registry provider key. */
export function providerOptionsNamespace(providerName: string): string {
  return PROVIDER_OPTIONS_NAMESPACE[providerName] ?? providerName;
}

/**
 * Merge `providerOptions.unknown` into the SDK-read provider namespace with
 * snake_case → camelCase key conversion, then delete the `unknown` namespace.
 *
 * This is the generic mechanism for passing through provider-agnostic params
 * (like `cache_control`) to the correct AI SDK provider namespace without
 * per-provider code paths.
 *
 * @param providerOptions - The mutable providerOptions record.
 * @param providerName - The resolved provider name (e.g. `anthropic`).
 */
export function forwardLanguageParams(
  providerOptions: Record<string, Record<string, unknown>>,
  providerName: string,
): void {
  const unknown = providerOptions['unknown'];
  if (!unknown) return;

  // Providers that reject cache fields — drop unknown namespace entirely.
  if (CACHE_DROP_PROVIDERS.has(providerName)) {
    delete providerOptions['unknown'];
    return;
  }

  const namespace = providerOptionsNamespace(providerName);
  const existing = providerOptions[namespace] ?? {};
  const merged = { ...existing };

  for (const [key, value] of Object.entries(unknown)) {
    const camelKey = snakeToCamel(key);
    // Don't overwrite explicit provider-namespaced values
    if (!(camelKey in merged)) {
      merged[camelKey] = value;
    }
  }

  providerOptions[namespace] = merged;
  delete providerOptions['unknown'];
}

/**
 * Walk each message (and its content parts) and forward any per-part
 * `providerOptions.unknown` into the resolved provider namespace via
 * `forwardLanguageParams`.
 */
export function forwardMessageProviderOptions(messages: unknown[], providerName: string) {
  for (const message of messages) {
    forwardProviderOptions(message, providerName);
    const content = (message as { content?: unknown }).content;
    if (Array.isArray(content)) {
      for (const part of content) forwardProviderOptions(part, providerName);
    }
  }
}

/** Forward a single value's `providerOptions.unknown` namespace, if present. */
export function forwardProviderOptions(value: unknown, providerName: string) {
  if (!value || typeof value !== 'object') return;
  const providerOptions = (value as { providerOptions?: Record<string, Record<string, unknown>> }).providerOptions;
  if (providerOptions) forwardLanguageParams(providerOptions, providerName);
}

// ---------------------------------------------------------------------------
// Effort ↔ provider mapping helpers
// ---------------------------------------------------------------------------

/**
 * Map an Anthropic thinking budget back to the closest OpenAI reasoning_effort.
 * Used by the OpenAI middleware when an Anthropic-style budget is provided
 * for an o-series model.
 */
export function effortFromBudget(budgetTokens: number, maxOutputTokens?: number): ReasoningEffort | undefined {
  if (budgetTokens <= 0) return undefined;

  const max = maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const fraction = budgetTokens / max;

  // Find the closest effort level. `effortFromBudget` feeds OpenAI's
  // `reasoningEffort`, whose shipped enum tops out at 'xhigh' — 'max' is only
  // valid for Anthropic's separate `effort` key, so it never appears here.
  if (fraction >= 0.85) return 'xhigh' as ReasoningEffort;
  if (fraction >= 0.65) return 'high' as ReasoningEffort;
  if (fraction >= 0.3) return 'medium' as ReasoningEffort;
  if (fraction >= 0.1) return 'low' as ReasoningEffort;
  return 'minimal' as ReasoningEffort;
}

// ---------------------------------------------------------------------------
// Prompt caching options
// ---------------------------------------------------------------------------

export type PromptCachingOptions = {
  prompt_cache_key?: string;
  prompt_cache_retention?: string;
  cache_control?: { type: string; ttl?: string };
};

/**
 * Parse top-level prompt caching fields from the request body into a
 * normalized shape suitable for storage in `providerOptions.unknown`.
 *
 * Returns `undefined` if no caching options are present.
 */
export function parsePromptCachingOptions(opts: {
  prompt_cache_key?: unknown;
  prompt_cache_retention?: unknown;
  cache_control?: unknown;
}): PromptCachingOptions | undefined {
  const result: PromptCachingOptions = {};
  let hasValue = false;

  if (typeof opts.prompt_cache_key === 'string' && opts.prompt_cache_key.length > 0) {
    result.prompt_cache_key = opts.prompt_cache_key;
    hasValue = true;
  }

  if (typeof opts.prompt_cache_retention === 'string' && opts.prompt_cache_retention.length > 0) {
    result.prompt_cache_retention = opts.prompt_cache_retention;
    hasValue = true;
  }

  if (opts.cache_control && typeof opts.cache_control === 'object' && 'type' in opts.cache_control) {
    result.cache_control = opts.cache_control as { type: string; ttl?: string };
    hasValue = true;
  }

  return hasValue ? result : undefined;
}

// ---------------------------------------------------------------------------
// Provider drop list for forwardLanguageParams
// ---------------------------------------------------------------------------

/**
 * Providers that explicitly reject cache_control fields. `forwardLanguageParams`
 * should NOT forward caching options to these providers.
 */
export const CACHE_DROP_PROVIDERS = new Set(['amazon-bedrock']);

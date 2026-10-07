import { z } from 'zod';

import { RequestValidationError } from '../errors/gatewayError.js';
import type { ReasoningEffort } from '../shared/types.js';

/** Convert a snake_case string to camelCase. */
export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Convert a camelCase string to snake_case. */
export function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

const EFFORT_BUDGET_FRACTIONS: Record<string, number> = {
  none: 0,
  minimal: 0.05,
  low: 0.15,
  medium: 0.5,
  high: 0.8,
  xhigh: 0.9,
  max: 1.0,
};

const MIN_BUDGET_TOKENS = 1024;

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

const PROVIDER_OPTIONS_NAMESPACE: Record<string, string> = {
  'anthropic-aws': 'anthropic',
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

  if (CACHE_FIELD_REJECTING_PROVIDERS.has(providerName)) {
    delete unknown['cache_control'];
    delete unknown['prompt_cache_key'];
    delete unknown['prompt_cache_retention'];
  }

  const namespace = providerOptionsNamespace(providerName);
  const existing = providerOptions[namespace] ?? {};
  const merged = { ...existing };

  for (const [key, value] of Object.entries(unknown)) {
    const camelKey = snakeToCamel(key);
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
      for (const part of content) {
        forwardProviderOptions(part, providerName);
      }
    }
  }
}

/** Forward a single value's `providerOptions.unknown` namespace, if present. */
export function forwardProviderOptions(value: unknown, providerName: string) {
  if (!value || typeof value !== 'object') return;
  const providerOptions = (value as { providerOptions?: Record<string, Record<string, unknown>> })
    .providerOptions;

  if (providerOptions) forwardLanguageParams(providerOptions, providerName);
}

/**
 * Map an Anthropic thinking budget back to the closest OpenAI reasoning_effort.
 * Used by the OpenAI middleware when an Anthropic-style budget is provided
 * for an o-series model.
 */
export function effortFromBudget(
  budgetTokens: number,
  maxOutputTokens?: number,
): ReasoningEffort | undefined {
  if (budgetTokens <= 0) return undefined;

  const max = maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const fraction = budgetTokens / max;

  if (fraction >= 0.85) return 'xhigh' as ReasoningEffort;
  if (fraction >= 0.65) return 'high' as ReasoningEffort;
  if (fraction >= 0.3) return 'medium' as ReasoningEffort;
  if (fraction >= 0.1) return 'low' as ReasoningEffort;

  return 'minimal' as ReasoningEffort;
}

export type PromptCachingOptions = {
  prompt_cache_key?: string;
  prompt_cache_retention?: 'in_memory' | '24h';
  cache_control?: { type: string; ttl?: string };
  cached_content?: string;
};

const promptCacheRetentionSchema = z.enum(['in_memory', '24h']);

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
  cached_content?: unknown;
}): PromptCachingOptions | undefined {
  const result: PromptCachingOptions = {};
  let hasValue = false;

  if (typeof opts.prompt_cache_key === 'string' && opts.prompt_cache_key.length > 0) {
    result.prompt_cache_key = opts.prompt_cache_key;
    hasValue = true;
  }

  if (typeof opts.cached_content === 'string' && opts.cached_content.length > 0) {
    result.cached_content = opts.cached_content;
    hasValue = true;
  } else if (
    opts.cached_content !== undefined &&
    opts.cached_content !== null &&
    typeof opts.cached_content !== 'string'
  ) {
    throw new RequestValidationError({
      message: 'cached_content must be a string',
      param: 'cached_content',
    });
  }

  if (typeof opts.prompt_cache_retention === 'string' && opts.prompt_cache_retention.length > 0) {
    const retention = promptCacheRetentionSchema.safeParse(opts.prompt_cache_retention);
    if (!retention.success) {
      throw new RequestValidationError({
        message: "prompt_cache_retention must be 'in_memory' or '24h'",
        param: 'prompt_cache_retention',
      });
    }

    result.prompt_cache_retention = retention.data;
    hasValue = true;
  }

  if (
    opts.cache_control &&
    typeof opts.cache_control === 'object' &&
    'type' in opts.cache_control
  ) {
    result.cache_control = opts.cache_control as { type: string; ttl?: string };
    hasValue = true;
  }

  return hasValue ? result : undefined;
}

/**
 * Providers that explicitly reject cache_control fields. `forwardLanguageParams`
 * should NOT forward caching options to these providers.
 */
export const CACHE_FIELD_REJECTING_PROVIDERS = new Set(['bedrock']);

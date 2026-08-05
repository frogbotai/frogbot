// OpenAI provider middleware — beforeUpstream hooks for o-series models.
//
// Translates cross-provider reasoning params into OpenAI-native format.
// Registered as `beforeUpstream` hooks when the OpenAI provider is resolved.

import type { BeforeUpstreamHook } from '../../hooks.js';
import { effortFromBudget } from '../../utils/params.js';

/**
 * OpenAI reasoning effort middleware.
 *
 * Reads `providerOptions.anthropic.thinking.budget_tokens` (the Anthropic-native
 * param) and maps it back to `providerOptions.openai.reasoningEffort` for
 * o-series models (o1, o3, o4-mini, etc.).
 *
 * Pass-through: if `providerOptions.openai.reasoningEffort` is already set
 * explicitly, this hook does nothing (explicit config wins). Also skips
 * non-reasoning models (only applies to `o1*`, `o3*`, `o4*` prefixes).
 */
export const openaiReasoningEffort: BeforeUpstreamHook = (args) => {
  // Only applies to o-series reasoning models
  const modelName = args.model.split('/').pop() ?? '';
  if (!isReasoningModel(modelName)) return;

  // Check if reasoning_effort is already explicitly configured
  const openaiOpts = args.providerOptions['openai'] as { reasoningEffort?: string } | undefined;
  if (openaiOpts?.reasoningEffort) return;

  // Read cross-provider thinking budget from Anthropic namespace
  const anthropicOpts = args.providerOptions['anthropic'] as { thinking?: { budget_tokens?: number } } | undefined;
  const budgetTokens = anthropicOpts?.thinking?.budget_tokens;
  if (!budgetTokens || budgetTokens <= 0) return;

  // Map budget back to effort level
  const effort = effortFromBudget(budgetTokens, args.params?.maxOutputTokens);
  if (!effort) return;

  // Set OpenAI reasoningEffort. Key is camelCase — the shipped
  // OpenAIChatLanguageModelOptions type reads that, not snake_case.
  args.providerOptions['openai'] = {
    ...(args.providerOptions['openai'] ?? {}),
    reasoningEffort: effort,
  };
};

export const openaiEmbedDimensions: BeforeUpstreamHook = (args) => {
  if (args.operation !== 'embeddings') return;

  const unknown = args.providerOptions.unknown;
  if (!unknown) return;

  const dimensions = unknown.dimensions;
  const user = unknown.user;
  const openai = { ...(args.providerOptions.openai ?? {}) };

  if (typeof dimensions === 'number') {
    openai.dimensions = dimensions;
    delete unknown.dimensions;
  }
  // `user` is OpenAI-only; other providers leave it stranded in `unknown`.
  if (typeof user === 'string') {
    openai.user = user;
    delete unknown.user;
  }

  if (Object.keys(openai).length > 0) {
    args.providerOptions.openai = openai;
  }
};

export const openaiPromptCacheBreakpoint: BeforeUpstreamHook = (args) => {
  const applyBreakpoint = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const target = value as Record<string, unknown>;
    const providerOptions = target.providerOptions as Record<string, Record<string, unknown>> | undefined;
    const cacheControl = providerOptions?.unknown?.cache_control;
    if (!cacheControl || typeof cacheControl !== 'object') return;

    providerOptions.openai = {
      ...(providerOptions.openai ?? {}),
      promptCacheBreakpoint: { mode: 'explicit' },
    };
    delete providerOptions.unknown.cache_control;
    if (Object.keys(providerOptions.unknown).length === 0) delete providerOptions.unknown;
  };

  for (const value of args.messages ?? []) {
    applyBreakpoint(value);
    if (!value || typeof value !== 'object') continue;
    const content = (value as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) applyBreakpoint(part);
  }

  const requestCacheControl = args.providerOptions.unknown?.cache_control;
  const lastMessage = args.messages?.at(-1);
  if (requestCacheControl && typeof requestCacheControl === 'object' && lastMessage && typeof lastMessage === 'object') {
    const message = lastMessage as Record<string, unknown>;
    const providerOptions = (message.providerOptions ??= {}) as Record<string, Record<string, unknown>>;
    providerOptions.unknown = { ...(providerOptions.unknown ?? {}), cache_control: requestCacheControl };
    applyBreakpoint(message);
    delete args.providerOptions.unknown?.cache_control;
    if (Object.keys(args.providerOptions.unknown ?? {}).length === 0) delete args.providerOptions.unknown;
  }
};

/** Check if a model name is an o-series reasoning model. */
function isReasoningModel(modelName: string): boolean {
  return /^o[134]/.test(modelName);
}

/**
 * All OpenAI beforeUpstream hooks, in registration order.
 */
export const openaiBeforeUpstream: BeforeUpstreamHook[] = [
  openaiReasoningEffort,
  openaiEmbedDimensions,
  openaiPromptCacheBreakpoint,
];

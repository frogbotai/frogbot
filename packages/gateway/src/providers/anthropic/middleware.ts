// Anthropic provider middleware — beforeUpstream hooks for Claude models.
//
// Translates cross-provider reasoning params into Anthropic-native format.
// Registered as `beforeUpstream` hooks when the Anthropic provider is resolved.

import type { BeforeUpstreamHook } from '../../hooks.js';
import { calculateReasoningBudgetFromEffort } from '../../utils/params.js';

/**
 * Claude thinking effort middleware.
 *
 * Reads `providerOptions.openai.reasoning_effort` (the OpenAI-native param)
 * and maps it to `providerOptions.anthropic.thinking.budgetTokens` for
 * Claude models that support extended thinking.
 *
 * Pass-through: if `providerOptions.anthropic.thinking` is already set
 * explicitly, this hook does nothing (explicit config wins).
 */
export const claudeThinkingEffort: BeforeUpstreamHook = (args) => {
  // Only applies to Claude models
  if (!args.model.includes('claude')) return;

  // Check if thinking is already explicitly configured
  const anthropicOpts = args.providerOptions['anthropic'] as
    | { thinking?: { type?: string; budgetTokens?: number } }
    | undefined;
  if (anthropicOpts?.thinking) return;

  // Read the cross-provider reasoning_effort from OpenAI namespace
  const openaiOpts = args.providerOptions['openai'] as
    | { reasoning_effort?: string }
    | undefined;
  const effort = openaiOpts?.reasoning_effort;
  if (!effort) return;

  // Calculate budget from effort
  const budgetTokens = calculateReasoningBudgetFromEffort(
    effort,
    args.params?.maxOutputTokens,
  );

  if (budgetTokens <= 0) return;

  // Set Anthropic thinking config. Key is camelCase `budgetTokens` — the
  // shipped AnthropicProviderOptions type reads that, not snake_case.
  args.providerOptions['anthropic'] = {
    ...(args.providerOptions['anthropic'] ?? {}),
    thinking: { type: 'enabled', budgetTokens },
  };
};

/**
 * All Anthropic beforeUpstream hooks, in registration order.
 */
export const anthropicBeforeUpstream: BeforeUpstreamHook[] = [
  claudeThinkingEffort,
];

import type { BeforeUpstreamHook } from '../../hooks.js';
import { calculateReasoningBudgetFromEffort } from '../../utils/params.js';

/**
 * Claude thinking effort middleware.
 *
 * Reads the cross-provider `providerOptions.unknown.reasoning_effort` and maps
 * it to `providerOptions.anthropic.thinking.budgetTokens` for Claude models
 * that support extended thinking.
 *
 * Pass-through: if `providerOptions.anthropic.thinking` is already set
 * explicitly, this hook does nothing (explicit config wins).
 */
export const claudeThinkingEffort: BeforeUpstreamHook = (args) => {
  if (!args.model.includes('claude')) return;

  const anthropicOpts = args.providerOptions['anthropic'] as
    { thinking?: { type?: string; budgetTokens?: number } } | undefined;

  if (anthropicOpts?.thinking) return;

  const effort = args.providerOptions['unknown']?.['reasoning_effort'];
  if (typeof effort !== 'string') return;

  const budgetTokens = calculateReasoningBudgetFromEffort(effort, args.params?.maxOutputTokens);

  if (budgetTokens <= 0) return;

  args.providerOptions['anthropic'] = {
    ...(args.providerOptions['anthropic'] ?? {}),
    thinking: { type: 'enabled', budgetTokens },
  };
};

/**
 * All Anthropic beforeUpstream hooks, in registration order.
 */
export const anthropicBeforeUpstream: BeforeUpstreamHook[] = [claudeThinkingEffort];

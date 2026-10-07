import type { BeforeUpstreamHook } from '../../hooks.js';
import { calculateReasoningBudgetFromEffort } from '../../utils/params.js';
import { googleEmbedDimensions } from '../google/middleware.js';

/**
 * Vertex thinking budget middleware.
 *
 * Reads the cross-provider `providerOptions.unknown.reasoning_effort` and maps
 * it to `providerOptions.google.thinkingConfig.thinkingBudget` for Gemini models
 * that support thinking on Vertex AI.
 *
 * Pass-through: if `providerOptions.google.thinkingConfig` is already set
 * explicitly, this hook does nothing.
 */
export const vertexThinkingBudget: BeforeUpstreamHook = (args) => {
  if (!args.model.includes('gemini')) return;

  const googleOpts = args.providerOptions['google'] as
    { thinkingConfig?: { thinkingBudget?: number } } | undefined;

  if (googleOpts?.thinkingConfig) return;

  const effort = args.providerOptions['unknown']?.['reasoning_effort'];
  if (typeof effort !== 'string') return;

  const budgetTokens = calculateReasoningBudgetFromEffort(effort, args.params?.maxOutputTokens);

  if (budgetTokens <= 0) return;

  args.providerOptions['google'] = {
    ...(args.providerOptions['google'] ?? {}),
    thinkingConfig: { thinkingBudget: budgetTokens },
  };
};

/**
 * All Vertex beforeUpstream hooks, in registration order.
 */
export const vertexBeforeUpstream: BeforeUpstreamHook[] = [
  vertexThinkingBudget,
  googleEmbedDimensions,
];

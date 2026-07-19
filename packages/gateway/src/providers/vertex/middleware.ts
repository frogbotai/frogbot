// Vertex AI provider middleware — beforeUpstream hooks for Gemini models.
//
// Translates cross-provider reasoning params into Vertex/Gemini-native format.

import type { BeforeUpstreamHook } from '../../hooks.js';
import { calculateReasoningBudgetFromEffort } from '../../utils/params.js';
import { googleEmbedDimensions } from '../google/middleware.js';

/**
 * Vertex thinking budget middleware.
 *
 * Reads `providerOptions.openai.reasoning_effort` (cross-provider param)
 * and maps it to `providerOptions.google.thinkingConfig.thinkingBudget` for
 * Gemini models that support thinking on Vertex AI.
 *
 * Pass-through: if `providerOptions.google.thinkingConfig` is already set
 * explicitly, this hook does nothing.
 */
export const vertexThinkingBudget: BeforeUpstreamHook = (args) => {
  // Only applies to Gemini models
  if (!args.model.includes('gemini')) return;

  // Check if thinking is already explicitly configured
  const googleOpts = args.providerOptions['google'] as
    | { thinkingConfig?: { thinkingBudget?: number } }
    | undefined;
  if (googleOpts?.thinkingConfig) return;

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

  // Set Google/Vertex thinking config
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

import type { BeforeUpstreamHook } from '../../hooks.js';
import {
  calculateReasoningBudgetFromEffort,
  forwardLanguageParams,
  forwardMessageProviderOptions,
} from '../../utils/params.js';
import { claudeThinkingEffort } from '../anthropic/middleware.js';
import { googleEmbedDimensions } from '../google/middleware.js';
import { isVertexAnthropicModel } from './models.js';

/**
 * Gemini thinking budget middleware.
 *
 * Reads the cross-provider `providerOptions.unknown.reasoning_effort` and maps
 * it to `providerOptions[namespace].thinkingConfig.thinkingBudget` for Gemini
 * models. The namespace is the one the route's SDK reads: `vertex` on Vertex AI,
 * `google` behind AI Gateway.
 *
 * Pass-through: if `providerOptions[namespace].thinkingConfig` is already set
 * explicitly, this hook does nothing.
 */
export function vertexThinkingBudget(namespace: string): BeforeUpstreamHook {
  return (args) => {
    if (!args.model.includes('gemini')) return;

    const options = args.providerOptions[namespace] as
      { thinkingConfig?: { thinkingBudget?: number } } | undefined;

    if (options?.thinkingConfig) return;

    const effort = args.providerOptions['unknown']?.['reasoning_effort'];
    if (typeof effort !== 'string') return;

    const budgetTokens = calculateReasoningBudgetFromEffort(effort, args.params?.maxOutputTokens);

    if (budgetTokens <= 0) return;

    args.providerOptions[namespace] = {
      ...(args.providerOptions[namespace] ?? {}),
      thinkingConfig: { thinkingBudget: budgetTokens },
    };
  };
}

/**
 * Claude on Vertex reads `anthropic` options, so this maps `reasoning_effort`
 * to Anthropic thinking and re-homes the request-, message- and part-level
 * `unknown` options (`cache_control` included) under `anthropic`.
 */
export const vertexClaudeOptions: BeforeUpstreamHook = async (args) => {
  await claudeThinkingEffort(args);

  if (args.messages) forwardMessageProviderOptions(args.messages, 'anthropic');

  forwardLanguageParams(args.providerOptions, 'anthropic');
};

const geminiThinkingBudget = vertexThinkingBudget('vertex');

/** Runs the Claude or the Gemini translation, by the model's catalog adapter. */
export const vertexModelOptions: BeforeUpstreamHook = (args) =>
  isVertexAnthropicModel(args.model) ? vertexClaudeOptions(args) : geminiThinkingBudget(args);

/**
 * All Vertex beforeUpstream hooks, in registration order.
 */
export const vertexBeforeUpstream: BeforeUpstreamHook[] = [
  vertexModelOptions,
  googleEmbedDimensions,
];

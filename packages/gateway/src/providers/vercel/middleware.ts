import type { BeforeUpstreamHook } from '../../hooks.js';
import { forwardLanguageParams, forwardMessageProviderOptions } from '../../utils/params.js';
import { claudeThinkingEffort } from '../anthropic/middleware.js';
import { openaiPromptCacheBreakpoint, openaiReasoningEffort } from '../openai/middleware.js';
import { vertexThinkingBudget } from '../vertex/middleware.js';

type CreatorTranslation = { namespace: string; hooks: BeforeUpstreamHook[] };

const CREATORS: Record<string, CreatorTranslation> = {
  anthropic: { namespace: 'anthropic', hooks: [claudeThinkingEffort] },
  google: { namespace: 'google', hooks: [vertexThinkingBudget] },
  openai: { namespace: 'openai', hooks: [openaiReasoningEffort, openaiPromptCacheBreakpoint] },
};

function creatorOf(model: string): string | undefined {
  const [, creator] = model.split('/');

  return creator;
}

/**
 * Moves a passthrough `gateway` body field into `providerOptions.gateway`,
 * where AI Gateway reads routing options. Explicit `gateway` keys win.
 */
export const vercelGatewayOptions: BeforeUpstreamHook = (args) => {
  const unknown = args.providerOptions.unknown;
  const routing = unknown?.gateway;

  if (!routing || typeof routing !== 'object' || Array.isArray(routing)) return;

  args.providerOptions.gateway = { ...routing, ...(args.providerOptions.gateway ?? {}) };

  delete unknown.gateway;
};

/**
 * Applies the upstream creator's translation hooks, then re-homes the
 * remaining request-, message- and part-level `unknown` options under the
 * creator's namespace so they are not stranded under `providerOptions.vercel`.
 */
export const vercelCreatorOptions: BeforeUpstreamHook = async (args) => {
  const creator = creatorOf(args.model);
  const translation = creator ? CREATORS[creator] : undefined;

  if (!translation) return;

  for (const hook of translation.hooks) {
    await hook(args);
  }

  if (args.messages) forwardMessageProviderOptions(args.messages, translation.namespace);

  forwardLanguageParams(args.providerOptions, translation.namespace);
};

export const vercelBeforeUpstream: BeforeUpstreamHook[] = [
  vercelGatewayOptions,
  vercelCreatorOptions,
];

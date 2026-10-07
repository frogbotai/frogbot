import type { OpenRouterProviderOptions } from '@openrouter/ai-sdk-provider';

import type { BeforeUpstreamHook } from '../../hooks.js';

type OpenRouterReasoning = NonNullable<OpenRouterProviderOptions['reasoning']>;

type OpenRouterEffort = Extract<OpenRouterReasoning, { effort: unknown }>['effort'];

const EFFORTS = new Set<string>(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']);

function reasoningFromEffort(effort: unknown): OpenRouterReasoning | undefined {
  if (typeof effort !== 'string') return undefined;

  const normalized = effort.toLowerCase() === 'max' ? 'xhigh' : effort.toLowerCase();

  return EFFORTS.has(normalized) ? { effort: normalized as OpenRouterEffort } : undefined;
}

function reasoningFromThinking(thinking: unknown): OpenRouterReasoning | undefined {
  if (!thinking || typeof thinking !== 'object') return undefined;

  const { type, budgetTokens } = thinking as { type?: unknown; budgetTokens?: unknown };

  if (type === 'disabled') return { effort: 'none' };

  if (typeof budgetTokens === 'number' && budgetTokens > 0) return { max_tokens: budgetTokens };

  return type === 'enabled' || type === 'adaptive'
    ? { enabled: true, effort: 'medium' }
    : undefined;
}

/**
 * Translates chat/Responses `unknown.reasoning_effort` and Messages
 * `anthropic.thinking` into `openrouter.reasoning`. An explicit
 * `openrouter.reasoning`, or a native chat `reasoning` body field still in
 * `unknown`, wins; the translated sources are always removed so they are not
 * spread into the upstream body as unknown fields.
 */
export const openrouterReasoning: BeforeUpstreamHook = (args) => {
  const unknown = args.providerOptions.unknown;
  const anthropic = args.providerOptions.anthropic;
  const effort = unknown?.reasoning_effort;
  const thinking = anthropic?.thinking;

  if (unknown) delete unknown.reasoning_effort;

  if (anthropic) {
    delete anthropic.thinking;

    if (Object.keys(anthropic).length === 0) delete args.providerOptions.anthropic;
  }

  const openrouter = args.providerOptions.openrouter;

  if (openrouter?.reasoning || unknown?.reasoning) return;

  const reasoning = reasoningFromThinking(thinking) ?? reasoningFromEffort(effort);

  if (!reasoning) return;

  args.providerOptions.openrouter = { ...(openrouter ?? {}), reasoning };
};

export const openrouterBeforeUpstream: BeforeUpstreamHook[] = [openrouterReasoning];

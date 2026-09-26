// Automatic prompt caching for Claude on `/v1/responses`.
//
// The OpenAI Responses wire has no `cache_control` field — OpenAI caches
// prefixes automatically. Claude only caches up to an explicit breakpoint, so
// without one a Responses client (Codex, the OpenAI SDK) pointed at Claude
// never gets a cache hit. We mirror OpenAI's behavior by placing a single
// breakpoint after `instructions`, the stable prefix of every turn. Prompts
// below Claude's minimum cacheable length are simply not cached upstream.

import type { SystemModelMessage } from '@ai-sdk/provider-utils';

function isClaude(modelName: string): boolean {
  return modelName.includes('claude') || modelName.includes('anthropic.');
}

/**
 * Returns `instructions` as a cache-marked system message for Claude on
 * providers whose SDK honours a breakpoint, otherwise returns it unchanged.
 */
export function withInstructionsCache(
  instructions: string | undefined,
  providerName: string,
  modelName: string,
): string | SystemModelMessage | undefined {
  if (!instructions || !isClaude(modelName)) return instructions;

  if (providerName === 'bedrock') {
    return {
      role: 'system',
      content: instructions,
      providerOptions: { bedrock: { cachePoint: { type: 'default' } } },
    };
  }

  if (providerName === 'anthropic' || providerName === 'anthropic-aws') {
    return {
      role: 'system',
      content: instructions,
      providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
    };
  }

  return instructions;
}

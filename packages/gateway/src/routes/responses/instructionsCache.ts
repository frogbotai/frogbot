import type { SystemModelMessage } from '@ai-sdk/provider-utils';

function isClaude(modelName: string): boolean {
  return modelName.includes('claude') || modelName.includes('anthropic.');
}

/**
 * Returns `instructions` as a cache-marked system message for Claude, otherwise
 * returns it unchanged. Bedrock reads a cache point; every other Claude host
 * (Anthropic, OpenRouter, Vercel) reads `anthropic.cacheControl`.
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

  return {
    role: 'system',
    content: instructions,
    providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
  };
}

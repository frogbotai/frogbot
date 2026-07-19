import type { SystemModelMessage } from '@ai-sdk/provider-utils';
import type { AnthropicSystemParam } from '../types.js';

/**
 * Convert the top-level `system` parameter into AI SDK system messages.
 *
 * Anthropic accepts either a plain string or an array of text blocks (used
 * for granular cache control). Each block becomes its own system message so
 * every cache_control breakpoint survives: the AI SDK anthropic provider
 * emits one system text block per system message (convert-to-anthropic-
 * prompt.ts system case), reproducing the original block array on the wire.
 * Returns `[]` if the caller passed no system prompt.
 */
export function parseSystemParam(
  system: AnthropicSystemParam | null | undefined,
): SystemModelMessage[] {
  if (system == null) return [];

  if (typeof system === 'string') {
    return [{ role: 'system', content: system }];
  }

  return system.map((block) => {
    const msg: SystemModelMessage = { role: 'system', content: block.text };
    if (block.cache_control) {
      msg.providerOptions = { unknown: { cache_control: block.cache_control } };
    }
    return msg;
  });
}

import type { SystemModelMessage } from '@ai-sdk/provider-utils';

import type { OpenAISystemMessage, OpenAIUnknownMessage } from '../types.js';

export function parseSystemMessage(msg: OpenAISystemMessage): SystemModelMessage {
  let content = msg.content;

  if (Array.isArray(content)) {
    content = content.map((p) => p.text).join('');
  }

  const result: SystemModelMessage = { role: 'system', content };

  if (msg.cache_control) {
    result.providerOptions = { unknown: { cache_control: msg.cache_control } };
  }

  return result;
}

/**
 * Like `parseSystemMessage`, but preserves part-level `cache_control`
 * (`content: [{ type: 'text', text, cache_control }]`, the shape Anthropic and
 * OpenRouter document for chat completions). Joining the parts would drop the
 * breakpoint, so when any part carries one, each part becomes its own system
 * message — mirroring how `/v1/messages` maps system blocks.
 */
export function parseSystemMessages(msg: OpenAISystemMessage): SystemModelMessage[] {
  const parts = Array.isArray(msg.content) ? msg.content : [];
  if (!parts.some((part) => part.cache_control)) return [parseSystemMessage(msg)];

  return parts.map((part, index) => {
    const cacheControl =
      part.cache_control ?? (index === parts.length - 1 ? msg.cache_control : undefined);
    const result: SystemModelMessage = { role: 'system', content: part.text };
    if (cacheControl) result.providerOptions = { unknown: { cache_control: cacheControl } };
    return result;
  });
}

// Unknown role (e.g. legacy `function`, vendor-specific roles).
// Forward as a system message with a synthetic role prefix so the
// provider sees the content rather than us silently dropping it.
export function parseUnknownMessage(msg: OpenAIUnknownMessage): SystemModelMessage {
  const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '');
  console.warn(`[gateway] unknown message role "${msg.role}" — forwarding as system`);
  return { role: 'system', content: `[role=${msg.role}] ${content}` };
}

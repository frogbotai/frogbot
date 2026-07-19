import type {
  AssistantContent,
  AssistantModelMessage,
  TextPart,
  ToolCallPart,
} from '@ai-sdk/provider-utils';

import type { AnthropicAssistantMessage } from '../types.js';

/**
 * Convert one Anthropic assistant message into an AI SDK assistant message.
 *
 * Supported block types: text, thinking, redacted_thinking, tool_use.
 * Unknown block types are dropped with a warning — they'd only appear from
 * extended-thinking or future block types we haven't modeled yet.
 */
export function parseAssistantMessage(
  msg: AnthropicAssistantMessage,
  messageIndex: number,
): AssistantModelMessage {
  if (typeof msg.content === 'string') {
    return { role: 'assistant', content: msg.content };
  }

  const parts: Exclude<AssistantContent, string> = [];

  for (const block of msg.content) {
    switch (block.type) {
      case 'text': {
        const part: TextPart = { type: 'text', text: block.text };
        if (block.cache_control) {
          part.providerOptions = { unknown: { cache_control: block.cache_control } };
        }
        parts.push(part);
        break;
      }

      case 'thinking': {
        parts.push({
          type: 'reasoning',
          text: block.thinking,
          providerOptions: block.signature
            ? { unknown: { signature: block.signature } }
            : undefined,
        });
        break;
      }

      case 'redacted_thinking': {
        // Empty text + redactedData marker — the AI SDK re-emits this when
        // re-serializing to Anthropic (see toAnthropicResponse).
        parts.push({
          type: 'reasoning',
          text: '',
          providerOptions: { unknown: { redactedData: block.data } },
        });
        break;
      }

      case 'tool_use': {
        const part: ToolCallPart = {
          type: 'tool-call',
          toolCallId: block.id,
          toolName: block.name,
          // Anthropic ships tool_use.input as a parsed object.
          input: block.input,
        };
        if (block.cache_control) {
          part.providerOptions = { unknown: { cache_control: block.cache_control } };
        }
        parts.push(part);
        break;
      }

      default: {
        // Reachable at runtime for forward-compat unknown block types the
        // schema lets through.
        const unknown = block as unknown as { type: string };
        console.warn(
          `[gateway] unsupported assistant content block type "${unknown.type}" in messages[${messageIndex}] — skipped`,
        );
        break;
      }
    }
  }

  // Collapse a lone text part to string form — unless it carries
  // providerOptions (cache_control), which string content cannot hold.
  if (parts.length === 1 && parts[0].type === 'text' && !parts[0].providerOptions) {
    return { role: 'assistant', content: (parts[0] as { type: 'text'; text: string }).text };
  }

  return { role: 'assistant', content: parts.length > 0 ? parts : '' };
}

import type { AssistantContent, AssistantModelMessage } from '@ai-sdk/provider-utils';
import { InvalidToolArgumentsError } from '../../../../errors/gatewayError.js';
import type { ProviderMetadata } from '../../../../shared/types.js';
import type { OpenAIAssistantMessage } from '../types.js';

export function parseAssistantMessage(msg: OpenAIAssistantMessage, messageIndex: number): AssistantModelMessage {
  const text = Array.isArray(msg.content)
    ? msg.content.map((p) => p.text).join('')
    : msg.content ?? '';
  const hasReasoningDetails = !!msg.reasoning_details && msg.reasoning_details.length > 0;
  const hasReasoning = hasReasoningDetails || !!msg.reasoning_content;
  const hasToolCalls = !!msg.tool_calls && msg.tool_calls.length > 0;
  // G55: the AI SDK's AssistantContent union has no refusal part type, so a
  // re-ingested refusal is preserved as a plain text part — dropping it would
  // silently erase the assistant turn on round-trip.
  const hasRefusal = typeof msg.refusal === 'string' && msg.refusal.length > 0;
  const providerOptions = assistantProviderOptions(msg);

  // Fast path: plain text only
  if (!hasReasoning && !hasToolCalls && !hasRefusal) {
    const result: AssistantModelMessage = { role: 'assistant', content: text };
    if (providerOptions) {
      result.providerOptions = providerOptions;
    }
    return result;
  }

  const parts: Exclude<AssistantContent, string> = [];

  // Reasoning first — order matters for some providers' caching semantics.
  // Prefer structured `reasoning_details` over flat `reasoning_content`.
  if (hasReasoningDetails) {
    for (const detail of msg.reasoning_details!) {
      if (detail.type === 'reasoning.text') {
        parts.push({
          type: 'reasoning',
          text: detail.text,
          providerOptions: detail.signature
            ? { unknown: { signature: detail.signature } }
            : undefined,
        });
      } else if (detail.type === 'reasoning.encrypted') {
        parts.push({
          type: 'reasoning',
          text: '',
          providerOptions: { unknown: { redactedData: detail.data } },
        });
      }
    }
  } else if (msg.reasoning_content) {
    parts.push({ type: 'reasoning', text: msg.reasoning_content });
  }

  if (text.length > 0) {
    parts.push({ type: 'text', text });
  }

  if (hasRefusal) {
    parts.push({ type: 'text', text: msg.refusal! });
  }

  if (hasToolCalls) {
    for (let j = 0; j < msg.tool_calls!.length; j++) {
      const tc = msg.tool_calls![j]!;
      const path = `messages[${messageIndex}].tool_calls[${j}].function.arguments`;
      parts.push({
        type: 'tool-call',
        toolCallId: tc.id,
        toolName: tc.function.name,
        input: parseToolCallArguments(tc.function.arguments, path),
      });
    }
  }

  const result: AssistantModelMessage = { role: 'assistant', content: parts };
  if (providerOptions) {
    result.providerOptions = providerOptions;
  }
  return result;
}

/**
 * Build message-level providerOptions from `extra_content` (already
 * provider-namespaced metadata, forwarded verbatim — G55) merged with the
 * gateway's `unknown.cache_control` namespace. An explicit `cache_control`
 * field wins over one nested inside `extra_content.unknown`.
 */
function assistantProviderOptions(msg: OpenAIAssistantMessage): ProviderMetadata | undefined {
  if (!msg.extra_content && !msg.cache_control) {
    return undefined;
  }

  const options: ProviderMetadata = {};
  if (msg.extra_content) {
    for (const [namespace, values] of Object.entries(msg.extra_content)) {
      options[namespace] = { ...values };
    }
  }
  if (msg.cache_control) {
    options['unknown'] = { ...options['unknown'], cache_control: msg.cache_control };
  }
  return options;
}

/**
 * Parse OpenAI's JSON-encoded tool-call arguments. Non-streaming requests receive
 * complete strings, so any parse failure is a real client error (400).
 */
function parseToolCallArguments(s: string, path: string): unknown {
  if (s === '' || s == null) return {};
  try {
    return JSON.parse(s);
  } catch (cause) {
    throw new InvalidToolArgumentsError({
      message: `Invalid JSON in tool-call arguments: ${(cause as Error).message}. Got: ${s.slice(0, 100)}${s.length > 100 ? '…' : ''}`,
      param: path,
    });
  }
}

import type { AssistantContent, AssistantModelMessage } from '@ai-sdk/provider-utils';

import { InvalidToolArgumentsError } from '../../../../errors/gatewayError.js';
import type { ProviderMetadata } from '../../../../shared/types.js';
import type { OpenAIAssistantMessage } from '../types.js';

export function parseAssistantMessage(
  msg: OpenAIAssistantMessage,
  messageIndex: number,
): AssistantModelMessage {
  const text = Array.isArray(msg.content)
    ? msg.content.map((p) => p.text).join('')
    : (msg.content ?? '');

  const hasReasoningDetails = !!msg.reasoning_details && msg.reasoning_details.length > 0;
  const hasReasoning = hasReasoningDetails || !!msg.reasoning_content;
  const hasToolCalls = !!msg.tool_calls && msg.tool_calls.length > 0;
  const hasRefusal = typeof msg.refusal === 'string' && msg.refusal.length > 0;
  const providerOptions = assistantProviderOptions(msg);

  if (!hasReasoning && !hasToolCalls && !hasRefusal) {
    const result: AssistantModelMessage = { role: 'assistant', content: text };
    if (providerOptions) {
      result.providerOptions = providerOptions;
    }

    return result;
  }

  const parts: Exclude<AssistantContent, string> = [];

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
      const tc = msg.tool_calls![j];
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

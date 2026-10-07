// OpenAI /v1/chat/completions → AI SDK ModelMessage[] translation.
//
// Inverted branch-for-branch from the AI SDK's
// `convertToOpenAICompatibleChatMessages` (Apache-2.0, Vercel).
//
// Tool correlation: remember assistant tool-call names, then coalesce adjacent
// OpenAI role:'tool' messages into one AI SDK tool message in wire order.

import type { ModelMessage, ToolModelMessage, ToolResultPart } from '@ai-sdk/provider-utils';

import { createLogger, type GatewayLogger } from '../../../../observability/logger.js';
import type { OpenAIMessage, OpenAIToolMessage, OpenAIUnknownMessage } from '../types.js';
import { parseAssistantMessage } from './assistant.js';
import { parseSystemMessages, parseUnknownMessage } from './system.js';
import { parseUserMessage } from './user.js';

const KNOWN_ROLES = new Set(['system', 'developer', 'user', 'assistant', 'tool']);

function isKnownMessage(msg: OpenAIMessage | OpenAIUnknownMessage): msg is OpenAIMessage {
  return KNOWN_ROLES.has(msg.role);
}

function parseToolRun(
  messages: (OpenAIMessage | OpenAIUnknownMessage)[],
  startIndex: number,
  toolNames: Map<string, string>,
): { message: ToolModelMessage; nextIndex: number } {
  const content: ToolResultPart[] = [];
  let nextIndex = startIndex;

  while (nextIndex < messages.length) {
    const msg = messages[nextIndex];
    if (!msg || !isKnownMessage(msg) || msg.role !== 'tool') {
      break;
    }

    content.push({
      type: 'tool-result',
      toolCallId: msg.tool_call_id,
      toolName: toolNames.get(msg.tool_call_id) ?? '',
      output: parseToolOutput(msg),
    });
    nextIndex++;
  }

  return { message: { role: 'tool', content }, nextIndex };
}

function parseToolOutput(msg: OpenAIToolMessage): ToolResultPart['output'] {
  if (Array.isArray(msg.content)) {
    return {
      type: 'content',
      value: msg.content.map((p) => ({ type: 'text', text: p.text })),
    };
  }
  return { type: 'text', value: msg.content };
}

function rememberToolNames(msg: OpenAIMessage, toolNames: Map<string, string>): void {
  if (msg.role !== 'assistant') return;

  for (const toolCall of msg.tool_calls ?? []) {
    toolNames.set(toolCall.id, toolCall.function.name);
  }
}

export function toModelMessages(
  messages: (OpenAIMessage | OpenAIUnknownMessage)[],
  logger: GatewayLogger = createLogger(),
): ModelMessage[] {
  const out: ModelMessage[] = [];
  const toolNames = new Map<string, string>();

  for (let i = 0; i < messages.length;) {
    const msg = messages[i];

    if (!isKnownMessage(msg)) {
      out.push(parseUnknownMessage(msg, logger));
      i++;
      continue;
    }

    if (msg.role === 'tool') {
      const toolRun = parseToolRun(messages, i, toolNames);
      out.push(toolRun.message);
      i = toolRun.nextIndex;
      continue;
    }

    rememberToolNames(msg, toolNames);

    switch (msg.role) {
      case 'system':
      case 'developer': {
        out.push(...parseSystemMessages(msg));
        break;
      }

      case 'user': {
        out.push(parseUserMessage(msg, i));
        break;
      }

      case 'assistant': {
        out.push(parseAssistantMessage(msg, i));
        break;
      }
    }

    i++;
  }

  return out;
}

// OpenAI /v1/chat/completions → AI SDK ModelMessage[] translation.
//
// Inverted branch-for-branch from the AI SDK's
// `convertToOpenAICompatibleChatMessages` (Apache-2.0, Vercel).
//
// Tool correlation: remember assistant tool-call names, then coalesce adjacent
// OpenAI role:'tool' messages into one AI SDK tool message in wire order.

import type { ModelMessage, ToolModelMessage, ToolResultPart } from '@ai-sdk/provider-utils';
import type { OpenAIMessage, OpenAIToolMessage } from '../types.js';
import { parseSystemMessage, parseUnknownMessage } from './system.js';
import { parseUserMessage } from './user.js';
import { parseAssistantMessage } from './assistant.js';

function parseToolRun(
  messages: OpenAIMessage[],
  startIndex: number,
  toolNames: Map<string, string>,
): { message: ToolModelMessage; nextIndex: number } {
  const content: ToolResultPart[] = [];
  let nextIndex = startIndex;

  while (nextIndex < messages.length) {
    const msg = messages[nextIndex];
    if (msg?.role !== 'tool') {
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

export function toModelMessages(messages: OpenAIMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  const toolNames = new Map<string, string>();

  for (let i = 0; i < messages.length; ) {
    const msg = messages[i];

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
        out.push(parseSystemMessage(msg));
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

      default: {
        out.push(parseUnknownMessage(msg));
        break;
      }
    }

    i++;
  }

  return out;
}

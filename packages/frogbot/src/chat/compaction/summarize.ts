import type { ModelMessage, ToolResultPart } from 'ai';

import type { ModelId } from '../../ai/types.js';
import type { FrogBotRequest } from '../../types/request.js';
import { estimateTokens } from './estimate.js';
import {
  fillsTemplate,
  SUMMARY_MAX_CHARS,
  SUMMARY_MAX_TOKENS,
  SUMMARY_NUDGE,
  summaryPrompt,
} from './prompt.js';

export const SUMMARY_SHORTENED = '[Summary shortened]';

export class CompactionError extends Error {
  readonly status = 502;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CompactionError';
  }
}

export type Summary = { text: string; tokens: { input: number; output: number } };

/**
 * Asks the chat's model for a summary of `messages` in the template, with one nudge when the reply
 * skips it. A reply over `SUMMARY_MAX_TOKENS` is cut at a heading, since some providers ignore
 * `maxOutputTokens`.
 */
export async function summarize({
  req,
  model,
  messages,
  update,
  abortSignal,
}: {
  req: FrogBotRequest;
  model: string;
  messages: ModelMessage[];
  update: boolean;
  abortSignal?: AbortSignal;
}): Promise<Summary> {
  const prompted: ModelMessage[] = [
    ...toolPartsAsText(messages),
    { role: 'user', content: summaryPrompt({ update }) },
  ];

  const send = async (input: ModelMessage[]) => {
    const result = await req.frogbot.generateText({
      model: model as ModelId,
      req,
      overrideAccess: true,
      messages: input,
      maxOutputTokens: SUMMARY_MAX_TOKENS,
      abortSignal,
    });

    return { text: result.text.trim(), usage: result.usage };
  };

  let reply = await send(prompted);
  let input = reply.usage.inputTokens ?? 0;

  if (!fillsTemplate(reply.text)) {
    reply = await send([...prompted, { role: 'user', content: SUMMARY_NUDGE }]);
    input += reply.usage.inputTokens ?? 0;
  }

  if (!reply.text) throw new CompactionError('The model returned an empty summary.');

  if (!fillsTemplate(reply.text)) {
    throw new CompactionError('The model did not fill in the summary template.');
  }

  const length = reply.usage.outputTokens ?? Math.ceil(reply.text.length / 4);

  if (length <= SUMMARY_MAX_TOKENS && reply.text.length <= SUMMARY_MAX_CHARS) {
    return { text: reply.text, tokens: { input, output: length } };
  }

  const text = shorten(reply.text);

  return { text, tokens: { input, output: estimateTokens(text) } };
}

function shorten(text: string): string {
  const marker = `\n\n${SUMMARY_SHORTENED}`;
  const room = text.slice(0, SUMMARY_MAX_CHARS - marker.length);
  const heading = room.lastIndexOf('\n## ');
  const paragraph = room.lastIndexOf('\n\n');
  const cut = heading > 0 ? heading : paragraph > 0 ? paragraph : room.length;

  return `${room.slice(0, cut).trimEnd()}${marker}`;
}

/**
 * Tool calls and results as text. The summary request has no tools, and some providers drop tool
 * content from such a request (Bedrock) or reject it.
 */
export function toolPartsAsText(messages: readonly ModelMessage[]): ModelMessage[] {
  return messages.flatMap((message): ModelMessage[] => {
    if (message.role === 'tool') {
      const text = message.content.flatMap((part) =>
        part.type === 'tool-result' ? [toolResultText(part)] : [],
      );

      return text.length === 0 ? [] : [{ role: 'user', content: text.join('\n\n') }];
    }

    if (message.role !== 'assistant' || typeof message.content === 'string') return [message];

    const content = message.content.flatMap((part) => {
      if (part.type === 'tool-call') {
        return [
          { type: 'text' as const, text: `[Tool call ${part.toolName}: ${json(part.input)}]` },
        ];
      }

      if (part.type === 'tool-result') {
        return [{ type: 'text' as const, text: toolResultText(part) }];
      }

      return part.type === 'tool-approval-request' ? [] : [part];
    });

    return content.length === 0 ? [] : [{ ...message, content }];
  });
}

function toolResultText({ toolName, output }: ToolResultPart): string {
  const text = (() => {
    switch (output.type) {
      case 'text':
      case 'error-text':
        return output.value;
      case 'json':
      case 'error-json':
        return json(output.value);
      case 'execution-denied':
        return `Denied${output.reason ? `: ${output.reason}` : '.'}`;
      case 'content':
        return output.value.map((item) => (item.type === 'text' ? item.text : '[file]')).join('\n');
      default:
        return '';
    }
  })();

  return `[Tool result ${toolName}${output.type.startsWith('error') ? ' (error)' : ''}: ${text}]`;
}

function json(value: unknown): string {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
}

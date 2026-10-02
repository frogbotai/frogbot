// Strict structured output, checked by the gateway.
//
// A client that sends `strict: true` with a JSON schema expects every reply to
// match it. Most providers enforce that themselves, but some cannot: Bedrock
// rejects both native structured output and strict tools for the newest Claude
// models, so the AI SDK falls back to a plain `json` tool and the model
// sometimes returns the wrong shape.
//
// This middleware checks each reply against the schema. A non-streaming reply
// that doesn't match is retried once with the problems shown to the model, the
// way opencode handles a bad StructuredOutput tool call. A second mismatch
// fails with `StructuredOutputError` (502). A streamed reply has already been
// sent, so it ends with an error event instead of a retry.

import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { wrapLanguageModel } from 'ai';
import { z } from 'zod';

import { StructuredOutputError } from '../errors/gatewayError.js';

type Check = (text: string) => string | undefined;

const MAX_ISSUES = 5;

/** Wrap `model` so strict JSON-schema replies are checked against the schema. */
export function withStrictOutput(model: LanguageModelV4): LanguageModelV4 {
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: 'v4',
      wrapGenerate: async ({ doGenerate, params, model: inner }) => {
        const check = schemaCheck(params);
        const first = await doGenerate();

        if (!check) return first;

        const text = replyText(first.content, first.finishReason.unified);

        if (text === undefined) return first;

        const issues = check(text);

        if (issues === undefined) return first;

        const second = await inner.doGenerate(retryParams(params, text, issues));
        const secondText = replyText(second.content, second.finishReason.unified);
        const secondIssues = secondText === undefined ? undefined : check(secondText);

        if (secondIssues !== undefined) throw new StructuredOutputError({ issues: secondIssues });

        return { ...second, usage: addUsage(first.usage, second.usage) };
      },
      wrapStream: async ({ doStream, params }) => {
        const check = schemaCheck(params);
        const result = await doStream();

        if (!check) return result;

        return { ...result, stream: result.stream.pipeThrough(checkStream(check)) };
      },
    },
  });
}

function schemaCheck(params: LanguageModelV4CallOptions): Check | undefined {
  const format = params.responseFormat;

  if (format?.type !== 'json' || format.schema == null) return undefined;

  let schema: z.ZodType;

  try {
    schema = z.fromJSONSchema(format.schema as Parameters<typeof z.fromJSONSchema>[0]);
  } catch {
    // A schema zod can't read is left to the provider rather than refused.
    return undefined;
  }

  return (text) => {
    let value: unknown;

    try {
      value = JSON.parse(text);
    } catch {
      return 'the reply is not valid JSON';
    }

    const result = schema.safeParse(value);

    if (result.success) return undefined;

    return result.error.issues
      .slice(0, MAX_ISSUES)
      .map(
        (issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`,
      )
      .join('; ');
  };
}

function replyText(content: LanguageModelV4Content[], finishReason: string): string | undefined {
  const calledTool = content.some((part) => part.type === 'tool-call');
  const text = content.map((part) => (part.type === 'text' ? part.text : '')).join('');

  return checksReply({ finishReason, text, calledTool }) ? text : undefined;
}

// Only a finished text answer is checked, matching when the AI SDK parses
// structured output. A tool call or a reply cut off at the token limit passes
// through, so the client sees its real finish reason.
function checksReply(reply: { finishReason: string; text: string; calledTool: boolean }) {
  if (reply.calledTool) return false;
  if (reply.finishReason === 'length' || reply.finishReason === 'tool-calls') return false;

  return reply.finishReason === 'stop' || reply.text.length > 0;
}

function retryParams(
  params: LanguageModelV4CallOptions,
  text: string,
  issues: string,
): LanguageModelV4CallOptions {
  return {
    ...params,
    prompt: [
      ...params.prompt,
      { role: 'assistant', content: [{ type: 'text', text }] },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Your reply did not match the required JSON schema (${issues}). Reply again with only the JSON value, matching the schema exactly.`,
          },
        ],
      },
    ],
  };
}

function checkStream(
  check: Check,
): TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart> {
  let text = '';
  let calledTool = false;

  return new TransformStream({
    transform(part, controller) {
      if (part.type === 'text-delta') text += part.delta;
      if (part.type === 'tool-call') calledTool = true;

      if (part.type === 'finish') {
        const finishReason = part.finishReason.unified;
        const issues = checksReply({ finishReason, text, calledTool }) ? check(text) : undefined;

        if (issues !== undefined) {
          controller.enqueue({ type: 'error', error: new StructuredOutputError({ issues }) });
        }
      }

      controller.enqueue(part);
    },
  });
}

function addUsage(a: LanguageModelV4Usage, b: LanguageModelV4Usage): LanguageModelV4Usage {
  const sum = (x: number | undefined, y: number | undefined) =>
    x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0);

  return {
    inputTokens: {
      total: sum(a.inputTokens.total, b.inputTokens.total),
      noCache: sum(a.inputTokens.noCache, b.inputTokens.noCache),
      cacheRead: sum(a.inputTokens.cacheRead, b.inputTokens.cacheRead),
      cacheWrite: sum(a.inputTokens.cacheWrite, b.inputTokens.cacheWrite),
    },
    outputTokens: {
      total: sum(a.outputTokens.total, b.outputTokens.total),
      text: sum(a.outputTokens.text, b.outputTokens.text),
      reasoning: sum(a.outputTokens.reasoning, b.outputTokens.reasoning),
    },
    ...(b.raw ? { raw: b.raw } : {}),
  };
}

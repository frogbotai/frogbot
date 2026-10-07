import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';
import { finish, mockUsage } from './mockModel.js';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { merchant: { type: 'string' }, total: { type: 'number' } },
  required: ['merchant', 'total'],
};

const GOOD = '{"merchant":"FROGBOT CAFE","total":42.17}';
const BAD = '{"merchant":"{\\"merchant\\": \\"FROGBOT CAFE\\", \\"total\\": 42.17}"}';

type Reply = string | { toolCall: string };

const usage = (input: number, output: number) =>
  mockUsage({
    inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: output, text: output, reasoning: undefined },
  });

const response = { id: 'r', modelId: 'mock-model', timestamp: new Date('2026-01-01T00:00:00Z') };

function scriptedModel(replies: Reply[]) {
  const calls: LanguageModelV4CallOptions[] = [];
  const next = (options: LanguageModelV4CallOptions) => {
    calls.push(options);

    return replies[Math.min(calls.length, replies.length) - 1];
  };

  const model: LanguageModelV4 = {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() {
      return Promise.resolve({});
    },
    doGenerate: (options) => {
      const reply = next(options);

      return Promise.resolve(
        typeof reply === 'string'
          ? {
              content: [{ type: 'text', text: reply }],
              finishReason: finish('stop', 'stop'),
              usage: usage(10, 5),
              warnings: [],
              response,
            }
          : {
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call_1',
                  toolName: reply.toolCall,
                  input: '{"city":"Paris"}',
                },
              ],
              finishReason: finish('tool-calls', 'tool_use'),
              usage: usage(10, 5),
              warnings: [],
              response,
            },
      );
    },
    doStream: (options) => {
      const reply = next(options) as string;
      const parts: LanguageModelV4StreamPart[] = [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: reply },
        { type: 'text-end', id: 't' },
        { type: 'finish', finishReason: finish('stop', 'stop'), usage: usage(10, 5) },
      ];

      return Promise.resolve({
        stream: new ReadableStream({
          start(controller) {
            for (const part of parts) controller.enqueue(part);

            controller.close();
          },
        }),
      });
    },
  };

  return { model, calls };
}

function makeApp(model: LanguageModelV4) {
  const registry = { openai: { languageModel: () => model } } as unknown as ProviderRegistry;

  return createApp({ registry });
}

const chatBody = (strict: boolean, extra: Record<string, unknown> = {}) => ({
  model: 'openai/gpt-4o-mini',
  messages: [{ role: 'user', content: 'Extract the receipt.' }],
  response_format: {
    type: 'json_schema',
    json_schema: { name: 'expense', strict, schema: SCHEMA },
  },
  ...extra,
});

type ChatBody = {
  choices?: Array<{ message: { content: string | null } }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
  error?: { code?: string; message?: string; type?: string };
};

function lastUserText(options: LanguageModelV4CallOptions): string {
  const message = options.prompt.at(-1)!;

  return Array.isArray(message.content)
    ? message.content.map((part) => ('text' in part ? part.text : '')).join('')
    : message.content;
}

async function streamFrames(app: ReturnType<typeof makeApp>, path: string, body: unknown) {
  const res = await app.request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  return { status: res.status, text: await res.text() };
}

describe('gateway strict structured output', () => {
  it('retries a chat reply that breaks a strict schema and returns the corrected one', async () => {
    const { model, calls } = scriptedModel([BAD, GOOD]);

    const { status, body } = await postJson<ChatBody>(
      makeApp(model),
      '/v1/chat/completions',
      chatBody(true),
    );

    expect(status).toBe(200);
    expect(body.choices?.[0]?.message.content).toBe(GOOD);
    expect(body.usage).toMatchObject({ prompt_tokens: 20, completion_tokens: 10 });
    expect(calls).toHaveLength(2);
    expect(calls[1].prompt.at(-2)).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: BAD }],
    });
    expect(lastUserText(calls[1])).toContain('total: Invalid input: expected number');
  });

  it('fails with structured_output_invalid when the retry breaks the schema too', async () => {
    const { model, calls } = scriptedModel([BAD, 'not json']);

    const { status, body } = await postJson<ChatBody>(
      makeApp(model),
      '/v1/chat/completions',
      chatBody(true),
    );

    expect(status).toBe(502);
    expect(body.error).toMatchObject({
      code: 'structured_output_invalid',
      type: 'server_error',
      message:
        "The model's reply did not match the requested JSON schema: the reply is not valid JSON",
    });
    expect(calls).toHaveLength(2);
  });

  it('passes a non-strict reply through unchecked', async () => {
    const { model, calls } = scriptedModel([BAD]);

    const { status, body } = await postJson<ChatBody>(
      makeApp(model),
      '/v1/chat/completions',
      chatBody(false),
    );

    expect(status).toBe(200);
    expect(body.choices?.[0]?.message.content).toBe(BAD);
    expect(calls).toHaveLength(1);
  });

  it('does not check a strict request whose reply is a tool call', async () => {
    const { model, calls } = scriptedModel([{ toolCall: 'weather' }]);

    const { status } = await postJson<ChatBody>(
      makeApp(model),
      '/v1/chat/completions',
      chatBody(true, {
        tools: [
          {
            type: 'function',
            function: { name: 'weather', parameters: { type: 'object', properties: {} } },
          },
        ],
      }),
    );

    expect(status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('ends a streamed chat reply that breaks a strict schema with an error chunk', async () => {
    const { model, calls } = scriptedModel([BAD]);

    const { status, text } = await streamFrames(
      makeApp(model),
      '/v1/chat/completions',
      chatBody(true, { stream: true }),
    );

    expect(status).toBe(200);
    expect(text).toContain('"code":"structured_output_invalid"');
    expect(calls).toHaveLength(1);
  });

  it('retries a responses reply that breaks a strict schema', async () => {
    const { model, calls } = scriptedModel([BAD, GOOD]);

    const { status, body } = await postJson<{ output_text?: string }>(
      makeApp(model),
      '/v1/responses',
      {
        model: 'openai/gpt-4o-mini',
        input: 'Extract the receipt.',
        text: { format: { type: 'json_schema', name: 'expense', strict: true, schema: SCHEMA } },
      },
    );

    expect(status).toBe(200);
    expect(body.output_text).toBe(GOOD);
    expect(calls).toHaveLength(2);
  });

  it('checks every messages reply with an output format, which is always strict', async () => {
    const { model, calls } = scriptedModel([BAD, BAD]);

    const { status, body } = await postJson<{ type?: string; error?: { type?: string } }>(
      makeApp(model),
      '/v1/messages',
      {
        model: 'openai/gpt-4o-mini',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Extract the receipt.' }],
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      },
    );

    expect(status).toBe(502);
    expect(body.type).toBe('error');
    expect(calls).toHaveLength(2);
  });
});

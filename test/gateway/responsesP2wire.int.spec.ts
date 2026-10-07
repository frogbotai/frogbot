import type { LanguageModelV4, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { finish, mockUsage } from './mockModel.js';

function makeApp(mockModel: LanguageModelV4) {
  const fakeProvider = { languageModel: () => mockModel };
  const registry = { openai: fakeProvider } as unknown as ProviderRegistry;

  return createApp({ registry });
}

function makeBaseModel() {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() {
      return Promise.resolve({});
    },
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: 'text', text: 'hi' }],
        finishReason: finish('stop', 'stop'),
        usage: mockUsage({
          inputTokens: { total: 1, noCache: 1 },
          outputTokens: { total: 1, text: 1 },
        }),
        warnings: [],
        response: { id: 'r1', modelId: 'mock-model', timestamp: new Date('2026-01-01T00:00:00Z') },
      }),
    doStream: () => Promise.resolve({ stream: new ReadableStream() }),
  } as unknown as LanguageModelV4;
}

describe('G70 — responses sub-routes and global notFound return JSON error envelope', () => {
  it('GET /v1/responses/:id returns JSON error envelope', async () => {
    const app = makeApp(makeBaseModel());
    const res = await app.request('http://localhost/v1/responses/resp_123', {
      method: 'GET',
    });

    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.status).toBe(404);

    const body = (await res.json()) as Record<string, unknown>;

    expect(body).toHaveProperty('error');
  });

  it('DELETE /v1/responses/:id returns JSON error envelope', async () => {
    const app = makeApp(makeBaseModel());
    const res = await app.request('http://localhost/v1/responses/resp_123', {
      method: 'DELETE',
    });

    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.status).toBe(404);
  });

  it('GET /v1/nonexistent returns JSON error envelope', async () => {
    const app = makeApp(makeBaseModel());
    const res = await app.request('http://localhost/v1/nonexistent', {
      method: 'GET',
    });

    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.status).toBe(404);

    const body = (await res.json()) as Record<string, unknown>;

    expect(body).toHaveProperty('error');
  });
});

describe('G71 — responses streaming error event has correct nested shape (REJECTED)', () => {
  it('stream error event carries nested data.error object', async () => {
    const error = Object.assign(new Error('upstream failed'), { statusCode: 503 });
    const model = {
      ...makeBaseModel(),
      doStream: () =>
        Promise.resolve({
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
              controller.enqueue({ type: 'text-start', id: 'text-0' });

              controller.enqueue({
                type: 'text-delta',
                id: 'text-0',
                delta: 'hello',
              });

              controller.enqueue({ type: 'error', error });
              controller.close();
            },
          }),
        }),
    } as unknown as LanguageModelV4;

    const app = makeApp(model);
    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4o', input: 'hi', stream: true }),
    });

    expect(res.status).toBe(200);

    const text = await res.text();

    const errorBlock = text.split('\n\n').find((block) => block.includes('event: error'));

    expect(errorBlock).toBeDefined();

    const dataLine = errorBlock!.match(/^data: (.+)$/m)?.[1];

    expect(dataLine).toBeDefined();

    const data = JSON.parse(dataLine!) as Record<string, unknown>;

    expect(data).toHaveProperty('error');
    expect(data).toHaveProperty('error.message');
    expect(typeof (data.error as Record<string, unknown>).message).toBe('string');
  });
});

describe('G72 — post-peek catastrophic stream errors emit bare data: frame (not event:error)', () => {
  it('catastrophic post-peek error emits event:error frame, not a bare data: frame', async () => {
    const model = {
      ...makeBaseModel(),
      doStream: () =>
        Promise.resolve({
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
              controller.enqueue({ type: 'text-start', id: 'text-0' });

              controller.enqueue({
                type: 'text-delta',
                id: 'text-0',
                delta: 'hello',
              });

              controller.close();
            },
          }).pipeThrough(
            new TransformStream({
              transform(_chunk, controller) {
                controller.enqueue(_chunk);
              },
              flush(controller) {
                controller.error(new Error('catastrophic transform error'));
              },
            }),
          ),
        }),
    } as unknown as LanguageModelV4;

    const app = makeApp(model);
    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4o', input: 'hi', stream: true }),
    });

    expect(res.status).toBe(200);

    const text = await res.text();
    const blocks = text.split('\n\n').filter(Boolean);

    const dataOnlyBlocks = blocks.filter(
      (block) =>
        !block.startsWith(':') &&
        !block.includes('data: [DONE]') &&
        Boolean(block.match(/^data: \{/m)) &&
        !block.match(/^event: /m),
    );

    expect(dataOnlyBlocks).toHaveLength(0);
  });
});

describe('G73 — response.completed usage includes token details', () => {
  it('response.completed carries input_tokens_details.cached_tokens and output_tokens_details.reasoning_tokens', async () => {
    const model = {
      ...makeBaseModel(),
      doStream: () =>
        Promise.resolve({
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
              controller.enqueue({
                type: 'stream-start',
                warnings: [],
              });

              controller.enqueue({ type: 'text-start', id: 'text-0' });

              controller.enqueue({
                type: 'text-delta',
                id: 'text-0',
                delta: 'hi',
              });

              controller.enqueue({ type: 'text-end', id: 'text-0' });

              controller.enqueue({
                type: 'finish',
                finishReason: finish('stop', 'stop'),
                usage: mockUsage({
                  inputTokens: {
                    total: 20,
                    noCache: 10,
                    cacheRead: 8,
                    cacheWrite: 2,
                  },
                  outputTokens: {
                    total: 15,
                    text: 10,
                    reasoning: 5,
                  },
                }),
              });

              controller.close();
            },
          }),
        }),
    } as unknown as LanguageModelV4;

    const app = makeApp(model);
    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4o', input: 'hi', stream: true }),
    });

    expect(res.status).toBe(200);

    const text = await res.text();

    const completedBlock = text
      .split('\n\n')
      .find((block) => block.includes('event: response.completed'));

    expect(completedBlock).toBeDefined();

    const dataLine = completedBlock!.match(/^data: (.+)$/m)?.[1];
    const data = JSON.parse(dataLine!) as { response?: { usage?: Record<string, unknown> } };
    const usage = data.response?.usage;

    expect(usage).toBeDefined();

    expect(usage).toHaveProperty('input_tokens_details.cached_tokens', 8);
    expect(usage).toHaveProperty('output_tokens_details.reasoning_tokens', 5);
  });
});

describe('G74 — reasoning delta duplication', () => {
  it('reasoning-delta emits exactly one delta event type (not both summary and content)', async () => {
    const model = {
      ...makeBaseModel(),
      doStream: () =>
        Promise.resolve({
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
              controller.enqueue({
                type: 'stream-start',
                warnings: [],
              });

              controller.enqueue({ type: 'reasoning-start', id: 'reasoning-0' });

              controller.enqueue({
                type: 'reasoning-delta',
                id: 'reasoning-0',
                delta: 'thinking...',
              });

              controller.enqueue({ type: 'reasoning-end', id: 'reasoning-0' });

              controller.enqueue({
                type: 'finish',
                finishReason: finish('stop'),
                usage: mockUsage({
                  inputTokens: { total: 5, noCache: 5 },
                  outputTokens: { total: 3, text: 0, reasoning: 3 },
                }),
              });

              controller.close();
            },
          }),
        }),
    } as unknown as LanguageModelV4;

    const app = makeApp(model);
    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4o', input: 'think', stream: true }),
    });

    expect(res.status).toBe(200);

    const text = await res.text();
    const events = [...text.matchAll(/^event: (.+)$/gm)].map((m) => m[1]);

    const summaryDeltas = events.filter((e) => e === 'response.reasoning_summary_text.delta');
    const contentDeltas = events.filter((e) => e === 'response.reasoning_text.delta');

    const totalDeltaEvents = summaryDeltas.length + contentDeltas.length;

    expect(totalDeltaEvents).toBe(1);
  });
});

describe('G49 — x-request-id present on streaming responses SSE response', () => {
  it('streaming responses response includes x-request-id header', async () => {
    const model = {
      ...makeBaseModel(),
      doStream: () =>
        Promise.resolve({
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
              controller.enqueue({ type: 'text-start', id: 'text-0' });

              controller.enqueue({
                type: 'text-delta',
                id: 'text-0',
                delta: 'hi',
              });

              controller.close();
            },
          }),
        }),
    } as unknown as LanguageModelV4;

    const app = makeApp(model);
    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4o', input: 'hi', stream: true }),
    });

    expect(res.status).toBe(200);
    expect(
      res.headers.get('x-request-id'),
      'streaming responses SSE response missing x-request-id',
    ).not.toBeNull();

    await res.text();
  });
});

describe('G51 — responses stream terminal-frame count', () => {
  it('terminates with exactly one response.completed and no [DONE] sentinel', async () => {
    const model = {
      ...makeBaseModel(),
      doStream: () =>
        Promise.resolve({
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
              controller.enqueue({ type: 'text-start', id: 'text-0' });

              controller.enqueue({
                type: 'text-delta',
                id: 'text-0',
                delta: 'hi',
              });

              controller.enqueue({ type: 'text-end', id: 'text-0' });

              controller.enqueue({
                type: 'finish',
                finishReason: finish('stop', 'stop'),
                usage: mockUsage({
                  inputTokens: { total: 5, noCache: 5 },
                  outputTokens: { total: 4, text: 4 },
                }),
              });

              controller.close();
            },
          }),
        }),
    } as unknown as LanguageModelV4;

    const app = makeApp(model);
    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4o', input: 'hi', stream: true }),
    });

    expect(res.status).toBe(200);

    const text = await res.text();
    const completedEvents = [...text.matchAll(/^event: (.+)$/gm)]
      .map((m) => m[1])
      .filter((e) => e === 'response.completed');

    expect(
      completedEvents,
      'responses stream must terminate with exactly one response.completed',
    ).toHaveLength(1);

    const doneCount = (text.match(/^data: \[DONE\]$/gm) ?? []).length;

    expect(doneCount, 'responses wire must not carry the OpenAI-chat-only [DONE] sentinel').toBe(0);
  });
});

describe('G75 — reasoning items surface encrypted_content', () => {
  it('non-streaming reasoning item carries encrypted_content from providerMetadata', async () => {
    const model = {
      ...makeBaseModel(),
      doGenerate: () =>
        Promise.resolve({
          content: [
            {
              type: 'reasoning',
              text: 'thinking',
              providerMetadata: {
                openai: { itemId: 'rs_1', reasoningEncryptedContent: 'enc_abc' },
              },
            },
            { type: 'text', text: 'hi' },
          ],
          finishReason: finish('stop', 'stop'),
          usage: mockUsage({
            inputTokens: { total: 1, noCache: 1 },
            outputTokens: { total: 1, text: 1 },
          }),
          warnings: [],
          response: {
            id: 'r1',
            modelId: 'mock-model',
            timestamp: new Date('2026-01-01T00:00:00Z'),
          },
        }),
    } as unknown as LanguageModelV4;

    const app = makeApp(model);
    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-5',
        input: 'think',
        include: ['reasoning.encrypted_content'],
      }),
    });

    expect(res.status).toBe(200);

    const body = (await res.json()) as { output: Array<Record<string, unknown>> };
    const reasoning = body.output.find((item) => item.type === 'reasoning');

    expect(reasoning).toBeDefined();
    expect(reasoning).toHaveProperty('encrypted_content', 'enc_abc');
  });

  it('streaming reasoning item carries encrypted_content from providerMetadata', async () => {
    const model = {
      ...makeBaseModel(),
      doStream: () =>
        Promise.resolve({
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
              controller.enqueue({
                type: 'stream-start',
                warnings: [],
              });

              controller.enqueue({
                type: 'reasoning-start',
                id: 'rs_1:0',
                providerMetadata: { openai: { itemId: 'rs_1', reasoningEncryptedContent: null } },
              });

              controller.enqueue({
                type: 'reasoning-delta',
                id: 'rs_1:0',
                delta: 'thinking...',
              });

              controller.enqueue({
                type: 'reasoning-end',
                id: 'rs_1:0',
                providerMetadata: {
                  openai: { itemId: 'rs_1', reasoningEncryptedContent: 'enc_xyz' },
                },
              });

              controller.enqueue({
                type: 'finish',
                finishReason: finish('stop', 'stop'),
                usage: mockUsage({
                  inputTokens: { total: 5, noCache: 5 },
                  outputTokens: { total: 3, text: 0, reasoning: 3 },
                }),
              });

              controller.close();
            },
          }),
        }),
    } as unknown as LanguageModelV4;

    const app = makeApp(model);
    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-5',
        input: 'think',
        stream: true,
        include: ['reasoning.encrypted_content'],
      }),
    });

    expect(res.status).toBe(200);

    const text = await res.text();
    const completedBlock = text
      .split('\n\n')
      .find((block) => block.includes('event: response.completed'));

    expect(completedBlock).toBeDefined();

    const dataLine = completedBlock!.match(/^data: (.+)$/m)?.[1];
    const data = JSON.parse(dataLine!) as { response: { output: Array<Record<string, unknown>> } };
    const reasoning = data.response.output.find((item) => item.type === 'reasoning');

    expect(reasoning).toBeDefined();
    expect(reasoning).toHaveProperty('encrypted_content', 'enc_xyz');
  });
});

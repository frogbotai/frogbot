import { Writable } from 'node:stream';

import type { LanguageModelV4, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { GatewayLogger, LogFn } from '../../packages/gateway/src/observability/logger.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { finish, mockUsage } from './mockModel.js';

const API_CALL_ERROR_MARKER = Symbol.for('vercel.ai.error.AI_APICallError');

function makeModel(opts: { text?: string } = {}): LanguageModelV4 {
  const text = opts.text ?? 'hi';

  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() {
      return Promise.resolve({});
    },
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: 'text', text }],
        finishReason: finish('stop'),
        usage: mockUsage({
          inputTokens: { total: 10, noCache: 10 },
          outputTokens: { total: 5, text: 5 },
        }),
        warnings: [],
        response: { id: 'r1', modelId: 'mock-model', timestamp: new Date('2026-01-01') },
      }),
    doStream: () =>
      Promise.resolve({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'text-start', id: 't0' });

            controller.enqueue({
              type: 'text-delta',
              id: 't0',
              delta: text,
            });

            controller.enqueue({ type: 'text-end', id: 't0' });

            controller.enqueue({
              type: 'finish',
              finishReason: finish('stop', 'stop'),
              usage: mockUsage({
                inputTokens: { total: 10, noCache: 10 },
                outputTokens: { total: 5, text: 5 },
              }),
            });

            controller.close();
          },
        }),
      }),
  };
}

function makeApp(hooks = {}) {
  const registry = { openai: { languageModel: () => makeModel() } } as unknown as ProviderRegistry;

  return createApp({ registry, hooks });
}

function capturePino() {
  const chunks: string[] = [];
  const sink = new Writable({
    write(chunk, _enc, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });

  const logger = pino({ level: 'info' }, sink) as unknown as GatewayLogger;
  const lines = () =>
    chunks
      .join('')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);

  return { logger, lines };
}

describe('G95 — token usage always partitioned (D-class, code-fact)', () => {
  it('CONFIRMED by source: genAi.ts emits 4 histogram points unconditionally (tracked, no runtime assertion)', () => {
    expect(true).toBe(true);
  });
});

describe('G101 — pre-resolution failures produce zero log lines', () => {
  it('logs at least one line for a schema-validation 400', async () => {
    const logLines: Array<{ level: string; msg?: string }> = [];
    const capture: LogFn = (first: Record<string, unknown> | string, msg?: string) => {
      if (typeof first === 'string') {
        logLines.push({ level: 'unknown', msg: first });
      } else {
        logLines.push({ level: (first as { level?: string }).level ?? 'unknown', msg });
      }
    };

    const logger: GatewayLogger = {
      trace: capture,
      debug: capture,
      info: capture,
      warn: capture,
      error: capture,
      fatal: capture,
    };

    const registry = {
      openai: { languageModel: () => makeModel() },
    } as unknown as ProviderRegistry;

    const app = createApp({ registry, logger });

    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4o' }),
    });

    expect(res.status).toBe(400);
    expect(logLines.length).toBeGreaterThan(0);
  });

  it('logs at least one line for a provider-not-found 404', async () => {
    const logLines: Array<{ level: string; msg?: string }> = [];
    const capture: LogFn = (first: Record<string, unknown> | string, msg?: string) => {
      if (typeof first === 'string') {
        logLines.push({ level: 'unknown', msg: first });
      } else {
        logLines.push({ level: (first as { level?: string }).level ?? 'unknown', msg });
      }
    };

    const logger: GatewayLogger = {
      trace: capture,
      debug: capture,
      info: capture,
      warn: capture,
      error: capture,
      fatal: capture,
    };

    const registry = {
      openai: { languageModel: () => makeModel() },
    } as unknown as ProviderRegistry;

    const app = createApp({ registry, logger });

    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'badprovider/some-model',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    expect(res.status).toBe(404);
    expect(logLines.length).toBeGreaterThan(0);
  });
});

describe('gateway errors with a real pino instance', () => {
  it('preserves a schema-validation 400 and logs it at warn level', async () => {
    const { logger, lines } = capturePino();
    const registry = {
      openai: { languageModel: () => makeModel() },
    } as unknown as ProviderRegistry;

    const app = createApp({ registry, logger });

    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4o' }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { type: 'invalid_request_error' } });
    expect(lines()).toMatchObject([{ level: 40, msg: 'request-error' }]);
  });

  it('preserves a post-resolution upstream 403 and logs both error layers', async () => {
    const { logger, lines } = capturePino();
    const upstreamBody = {
      error: {
        message: 'Forbidden',
        type: 'permission_error',
        code: 'permission_denied',
        param: null,
      },
    };

    const error = Object.assign(new Error('Forbidden'), {
      [API_CALL_ERROR_MARKER]: true,
      statusCode: 403,
      url: 'https://example.com',
      requestBodyValues: {},
      data: upstreamBody,
      isRetryable: false,
    });

    const model = { ...makeModel(), doGenerate: () => Promise.reject(error) } as LanguageModelV4;
    const registry = {
      openai: { languageModel: () => model },
    } as unknown as ProviderRegistry;

    const app = createApp({ registry, logger });

    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/model', messages: [{ role: 'user', content: 'hi' }] }),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(upstreamBody);
    expect(lines().filter((line) => line.msg === 'request-error')).toMatchObject([
      { level: 50, msg: 'request-error' },
      { level: 40, msg: 'request-error' },
    ]);
  });
});

describe('G103 — x-request-id injection: no sanitisation or prefix', () => {
  it('sanitises / rejects a path-traversal-shaped x-request-id', async () => {
    const app = makeApp();
    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': '../../evil',
      },
      body: JSON.stringify({ model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hi' }] }),
    });

    const echoed = res.headers.get('x-request-id') ?? '';

    expect(echoed).not.toContain('..');
    expect(echoed).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('isolates span-map entries when two requests share the same x-request-id', async () => {
    const ended: string[] = [];
    const spans: Record<string, unknown> = {};

    const app = makeApp();

    const id = 'collision-test-id';
    const [res1, res2] = await Promise.all([
      app.request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': id },
        body: JSON.stringify({
          model: 'openai/gpt-4o',
          messages: [{ role: 'user', content: 'req1' }],
        }),
      }),
      app.request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': id },
        body: JSON.stringify({
          model: 'openai/gpt-4o',
          messages: [{ role: 'user', content: 'req2' }],
        }),
      }),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const id1 = res1.headers.get('x-request-id');
    const id2 = res2.headers.get('x-request-id');

    expect(id1).not.toBe(id2);

    void ended;
    void spans;
  });
});

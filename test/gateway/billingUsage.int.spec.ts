import type { LanguageModelV4, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { AfterOperationHookArgs, Hooks, HookUsage } from '../../packages/gateway/src/hooks.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { finish, mockUsage } from './mockModel.js';

const USAGE = mockUsage({
  inputTokens: { total: 100, noCache: 70, cacheRead: 10, cacheWrite: 20 },
  outputTokens: { total: 50, text: 50 },
});

function createUsageMock(): LanguageModelV4 {
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
        finishReason: finish('stop'),
        usage: USAGE,
        warnings: [],
        response: {
          id: 'mock-resp-1',
          modelId: 'mock-model',
          timestamp: new Date('2026-01-01T00:00:00Z'),
        },
      }),
    doStream: () =>
      Promise.resolve({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'text-start', id: 't0' });

            controller.enqueue({
              type: 'text-delta',
              id: 't0',
              delta: 'hi',
            });

            controller.enqueue({ type: 'text-end', id: 't0' });

            controller.enqueue({
              type: 'finish',
              finishReason: finish('stop', 'stop'),
              usage: USAGE,
            });

            controller.close();
          },
        }),
      }),
  };
}

function makeApp(providerName: string, hooks: Hooks) {
  const registry = {
    [providerName]: { languageModel: () => createUsageMock() },
  } as unknown as ProviderRegistry;

  return createApp({ registry, hooks });
}

const readCacheWrite = (usage: HookUsage | undefined): number | undefined =>
  (usage as unknown as { cacheWriteTokens?: number } | undefined)?.cacheWriteTokens;

describe('gateway billing usage — cache-write token attribution (G96)', () => {
  it('chat non-streaming: exposes cacheWriteTokens to afterOperation hooks', async () => {
    const calls: AfterOperationHookArgs[] = [];
    const app = makeApp('openai', {
      afterOperation: [
        (args) => {
          calls.push(args);
        },
      ],
    });

    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].usage?.cachedInputTokens).toBe(10);
    expect(readCacheWrite(calls[0].usage)).toBe(20);
  });

  it('chat streaming: exposes cacheWriteTokens to afterOperation hooks', async () => {
    const calls: AfterOperationHookArgs[] = [];
    const app = makeApp('openai', {
      afterOperation: [
        (args) => {
          calls.push(args);
        },
      ],
    });

    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      }),
    });

    await res.text();

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].usage?.cachedInputTokens).toBe(10);
    expect(readCacheWrite(calls[0].usage)).toBe(20);
  });
});

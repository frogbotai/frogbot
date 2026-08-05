import { MockLanguageModelV4, MockProviderV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import type { ProviderRegistry } from '../src/providers/registry.js';

const modelUsage = {
  inputTokens: { total: 100, noCache: 30, cacheRead: 60, cacheWrite: 10 },
  outputTokens: { total: 20, text: 20 },
};

function buildUsageApp() {
  const afterUpstream = vi.fn();
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'ok' }],
      finishReason: 'stop',
      usage: modelUsage,
      warnings: [],
      response: { id: 'response-id', modelId: 'model', timestamp: new Date('2026-01-01T00:00:00Z') },
    }),
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({ type: 'text-start', id: 'text-0' });
          controller.enqueue({ type: 'text-delta', id: 'text-0', delta: 'ok' });
          controller.enqueue({ type: 'text-end', id: 'text-0' });
          controller.enqueue({ type: 'finish', finishReason: 'stop', usage: modelUsage });
          controller.close();
        },
      }),
    }),
  });
  const registry = {
    openai: new MockProviderV4({ languageModels: { model } }),
    anthropic: new MockProviderV4({ languageModels: { model } }),
  } as unknown as ProviderRegistry;
  return { app: createApp({ registry, hooks: { afterUpstream: [afterUpstream] } }), afterUpstream };
}

const cases = [
  {
    route: '/v1/chat/completions',
    body: { model: 'openai/model', messages: [{ role: 'user', content: 'hello' }] },
    assertUsage: (body: any) => expect(body.usage.prompt_tokens_details).toEqual({ cached_tokens: 60, cache_write_tokens: 10 }),
  },
  {
    route: '/v1/messages',
    body: { model: 'anthropic/model', max_tokens: 32, messages: [{ role: 'user', content: 'hello' }] },
    assertUsage: (body: any) => {
      expect(body.usage.cache_read_input_tokens).toBe(60);
      expect(body.usage.cache_creation_input_tokens).toBe(10);
    },
  },
  {
    route: '/v1/responses',
    body: { model: 'openai/model', input: 'hello' },
    assertUsage: (body: any) => expect(body.usage.input_tokens_details).toEqual({ cached_tokens: 60, cache_write_tokens: 10 }),
  },
] as const;

describe('cache usage matrix', () => {
  for (const testCase of cases) {
    it(`maps cache usage through ${testCase.route}`, async () => {
      const { app, afterUpstream } = buildUsageApp();
      const response = await app.request(testCase.route, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(testCase.body),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      testCase.assertUsage(body);
      expect(afterUpstream).toHaveBeenCalledWith(expect.objectContaining({
        usage: expect.objectContaining({ cachedInputTokens: 60, cacheWriteTokens: 10 }),
      }));
    });
  }

  for (const testCase of cases.slice(0, 2)) {
    it(`maps streaming cache usage through ${testCase.route}`, async () => {
      const { app, afterUpstream } = buildUsageApp();
      const response = await app.request(testCase.route, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...testCase.body, stream: true, stream_options: { include_usage: true } }),
      });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain(testCase.route === '/v1/messages' ? 'cache_read_input_tokens' : 'cached_tokens');
      expect(afterUpstream).toHaveBeenCalledWith(expect.objectContaining({
        usage: expect.objectContaining({ cachedInputTokens: 60, cacheWriteTokens: 10 }),
      }));
    });
  }
});

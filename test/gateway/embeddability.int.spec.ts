import type { LanguageModelV4, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import { createGateway } from '../../packages/gateway/src/gateway.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { finish, mockUsage } from './mockModel.js';

function createMockLanguageModel(): LanguageModelV4 {
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
        usage: mockUsage({
          inputTokens: { total: 1, noCache: 1 },
          outputTokens: { total: 1, text: 1 },
        }),
        warnings: [],
        response: { id: 'r', modelId: 'mock-model', timestamp: new Date('2026-01-01T00:00:00Z') },
      }),
    doStream: () => Promise.resolve({ stream: new ReadableStream<LanguageModelV4StreamPart>() }),
  };
}

function makeAppWithMockProvider(providerName: string) {
  const fakeProvider = { languageModel: () => createMockLanguageModel() };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;

  return createApp({ registry });
}

describe('gateway embeddability — mount recipe (G44)', () => {
  it('reaches the gateway when mounted under /v1 and POSTing /v1/chat/completions', async () => {
    const gw = makeAppWithMockProvider('groq');
    const host = new Hono();
    host.mount('/v1', gw.fetch);

    const res = await host.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'groq/test-model',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    expect(res.status).toBe(200);
  });

  it('accidentally routes the double-prefixed /v1/v1/chat/completions instead', async () => {
    const gw = makeAppWithMockProvider('groq');
    const host = new Hono();
    host.mount('/v1', gw.fetch);

    const res = await host.request('http://localhost/v1/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'groq/test-model',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    expect(res.status).toBe(200);
  });
});

describe('gateway config — provider allow/deny lists (G45)', () => {
  it('denies a provider named in disabled_providers with 404 not_found', async () => {
    const gw = createGateway({
      providers: {
        openai: { apiKey: 'sk-openai-test' },
        anthropic: { apiKey: 'sk-ant-test' },
      },
      disabled_providers: ['anthropic'],
    });

    const res = await gw.handler(
      new Request('http://localhost/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'anthropic/claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 100,
        }),
      }),
    );

    expect(res.status).toBe(404);

    const body = (await res.json()) as { error?: { type?: string } };

    expect(body.error?.type).toBe('not_found_error');
  });

  it('excludes providers not named in enabled_providers with 404 not_found', async () => {
    const gw = createGateway({
      providers: {
        openai: { apiKey: 'sk-openai-test' },
        anthropic: { apiKey: 'sk-ant-test' },
      },
      enabled_providers: ['openai'],
    });

    const res = await gw.handler(
      new Request('http://localhost/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'anthropic/claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 100,
        }),
      }),
    );

    expect(res.status).toBe(404);

    const body = (await res.json()) as { error?: { type?: string } };

    expect(body.error?.type).toBe('not_found_error');
  });
});

describe('gateway discovery — GET /v1/models (G37)', () => {
  it('lists models as an OpenAI-shaped { object: "list", data: [...] }', async () => {
    const app = makeAppWithMockProvider('groq');

    const res = await app.request('http://localhost/v1/models', { method: 'GET' });

    expect(res.status).toBe(200);

    const body = (await res.json()) as { object?: string; data?: unknown[] };

    expect(body.object).toBe('list');
    expect(Array.isArray(body.data)).toBe(true);
  });
});

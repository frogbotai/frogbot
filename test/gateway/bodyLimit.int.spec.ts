import type { LanguageModelV4 } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { finish, mockModel, mockUsage } from './mockModel.js';

function createMockLanguageModel(): LanguageModelV4 {
  return mockModel({
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
    doStream: () => Promise.resolve({ stream: new ReadableStream() }),
  });
}

function makeAppWithMockProvider(providerName: string, maxBodyBytes: number) {
  const fakeProvider = { languageModel: () => createMockLanguageModel() };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;

  return createApp({ registry, maxBodyBytes });
}

describe('gateway integration — request body size cap (G31)', () => {
  it('rejects an oversized /v1/chat/completions body with 413 when maxBodyBytes is set', async () => {
    const app = makeAppWithMockProvider('groq', 1024);
    const huge = 'x'.repeat(5 * 1024 * 1024);
    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'groq/test-model',
        messages: [{ role: 'user', content: huge }],
      }),
    });

    expect(res.status).toBe(413);

    const body = (await res.json()) as { error?: { code?: string } };

    expect(body.error?.code).toBe('request_entity_too_large');
  });

  it('rejects on content-length header exceeding maxBodyBytes without buffering the body', async () => {
    const app = makeAppWithMockProvider('groq', 1024);
    const huge = 'y'.repeat(2 * 1024 * 1024);
    const serialized = JSON.stringify({
      model: 'groq/test-model',
      messages: [{ role: 'user', content: huge }],
    });

    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(new TextEncoder().encode(serialized).byteLength),
      },
      body: serialized,
    });

    expect(res.status).toBe(413);
  });
});

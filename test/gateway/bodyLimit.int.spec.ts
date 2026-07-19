// Body-size cap enforcement across JSON routes.
//
// G31 (SP1 + MD11): `parseJsonBody` used to do a bare `await c.req.json()`
// with no size limit on all JSON routes (chat/messages/responses/embeddings),
// and the `maxBodyBytes` config knob was threaded ONLY to the transcriptions
// route. It is now enforced on every route: a Content-Length over the cap is
// rejected up front, and chunked bodies are read through a size-limited
// stream — both produce 413 `request_entity_too_large`.

import { describe, expect, it } from 'vitest';
import type { LanguageModelV4 } from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';

function createMockLanguageModel(): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    defaultObjectGenerationMode: undefined,
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: 'text', text: 'hi' }],
        finishReason: 'stop',
        usage: {
          inputTokens: { total: 1, noCache: 1 },
          outputTokens: { total: 1, text: 1 },
        },
        warnings: [],
        response: { id: 'r', modelId: 'mock-model', timestamp: new Date('2026-01-01T00:00:00Z') },
      }),
    doStream: () => Promise.resolve({ stream: new ReadableStream() }),
  } as LanguageModelV4;
}

function makeAppWithMockProvider(providerName: string, maxBodyBytes: number) {
  const fakeProvider = { languageModel: () => createMockLanguageModel() };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;
  return createApp({ registry, maxBodyBytes });
}

describe('gateway integration — request body size cap (G31)', () => {
  // An operator sets maxBodyBytes=1KB expecting a global DoS guard. A 5MB
  // chat body must be rejected with 413 request_entity_too_large before the
  // gateway buffers + parses it.
  it('rejects an oversized /v1/chat/completions body with 413 when maxBodyBytes is set', async () => {
    const app = makeAppWithMockProvider('groq', 1024);
    // ~5MB of user content — far exceeds the 1KB cap the operator configured.
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

  // The content-length header alone should let the gateway reject before it
  // ever buffers the body — the cheapest DoS guard.
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

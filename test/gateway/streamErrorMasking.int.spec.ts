import type { LanguageModelV4, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { parseSse } from '../__helpers/gateway/parse-sse.js';

const SENSITIVE =
  'upstream failure: internal-host-42.corp.local connection refused stacktrace at /srv/app/worker.js:214';

function createMidStreamErrorModel(): LanguageModelV4 {
  const error = Object.assign(new Error(SENSITIVE), { statusCode: 503 });

  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() {
      return Promise.resolve({});
    },
    doGenerate: () => Promise.reject(error),
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
  };
}

function makeAppWithMockProvider(providerName: string) {
  const fakeProvider = { languageModel: () => createMidStreamErrorModel() };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;

  return createApp({ registry });
}

describe('gateway integration — mid-stream SSE error masking (G35)', () => {
  it('masks the mid-stream error frame message in a streaming chat response (OpenAI)', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    onTestFinished(() => {
      vi.unstubAllEnvs();
    });

    const app = makeAppWithMockProvider('groq');
    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'groq/test-model',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      }),
    });

    expect(res.status).toBe(200);

    const raw = await res.text();

    expect(raw).not.toContain(SENSITIVE);
  });

  it('masks the mid-stream error frame message in a streaming messages response (Anthropic)', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    onTestFinished(() => {
      vi.unstubAllEnvs();
    });

    const app = makeAppWithMockProvider('anthropic');
    const res = await app.request('http://localhost/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic/test-model',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 100,
        stream: true,
      }),
    });

    expect(res.status).toBe(200);

    const raw = await res.text();
    const errorFrame = parseSse(raw).find((f) => f.event === 'error');

    expect(errorFrame?.data ?? '').not.toContain(SENSITIVE);
  });

  it('masks the mid-stream error frame message in a streaming responses response (OpenAI Responses)', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    onTestFinished(() => {
      vi.unstubAllEnvs();
    });

    const app = makeAppWithMockProvider('groq');
    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'groq/test-model',
        input: 'hi',
        stream: true,
      }),
    });

    expect(res.status).toBe(200);

    const raw = await res.text();

    expect(raw).not.toContain(SENSITIVE);
  });
});

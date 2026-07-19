// Mid-stream SSE error-frame masking.
//
// G35 (HE4): a mid-stream `{type:'error'}` part is serialized by the stream
// transform (chatCompletions/translators/stream.ts, messages
// translators/stream.ts, responses/translators/stream.ts) via
// extract*StreamErrorInfo. FIXED: the extractors now route every message
// through `maybeMaskMessage` (with `redactKeyFragments`) using the
// requestId/production context threaded from the handlers into the transform
// factories, so a 5xx error emitted AFTER the first content chunk is masked
// in production instead of streaming raw internals verbatim.

import { describe, expect, it } from 'vitest';
import type { LanguageModelV4, LanguageModelV4StreamPart } from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { parseSse } from '../__helpers/gateway/parse-sse.js';

const SENSITIVE =
  'upstream failure: internal-host-42.corp.local connection refused stacktrace at /srv/app/worker.js:214';

/**
 * A model that emits a real content chunk, THEN a `{type:'error'}` part with a
 * 5xx-class error carrying sensitive internal detail. Because content already
 * flowed, this is a mid-stream error handled by the transform, not the
 * early-peek path or the reader-level `toError` path.
 */
function createMidStreamErrorModel(): LanguageModelV4 {
  const error = Object.assign(new Error(SENSITIVE), { statusCode: 503 });
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    defaultObjectGenerationMode: undefined,
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: () => Promise.reject(error),
    doStream: () =>
      Promise.resolve({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'text-start', id: 'text-0' } as LanguageModelV4StreamPart);
            controller.enqueue({ type: 'text-delta', id: 'text-0', delta: 'hello' } as LanguageModelV4StreamPart);
            controller.enqueue({ type: 'error', error } as LanguageModelV4StreamPart);
            controller.close();
          },
        }),
      }),
  } as LanguageModelV4;
}

function makeAppWithMockProvider(providerName: string) {
  const fakeProvider = { languageModel: () => createMidStreamErrorModel() };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;
  return createApp({ registry });
}

describe('gateway integration — mid-stream SSE error masking (G35)', () => {
  // In production a mid-stream 5xx error frame must be masked: the client must
  // not receive the raw internal-host/stacktrace message that the masking
  // contract exists to redact. Currently the transform emits it verbatim.
  it('masks the mid-stream error frame message in a streaming chat response (OpenAI)', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
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

      // Content already flowed, so this is a 200 with an in-band error frame.
      expect(res.status).toBe(200);
      const raw = await res.text();
      expect(raw).not.toContain(SENSITIVE);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  // Same leak on the Anthropic streaming path — the `event: error` frame's
  // message must be masked in production.
  it('masks the mid-stream error frame message in a streaming messages response (Anthropic)', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
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
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  // The responses route shares the OpenAI extractor; its mid-stream `error`
  // frame (and the `failed` terminal envelope derived from it) must also be
  // masked in production.
  it('masks the mid-stream error frame message in a streaming responses response (OpenAI Responses)', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
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
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});

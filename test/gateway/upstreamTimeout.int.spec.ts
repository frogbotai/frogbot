// Upstream timeout enforcement.
//
// G32 (SP2 + S8): handlers used to pass only `abortSignal: c.req.raw.signal`
// (client abort) into generateText/streamText with no server-side deadline.
// Now `upstreamTimeoutMs` composes `AbortSignal.any([clientSignal,
// AbortSignal.timeout(ms)])` so a provider that accepts the socket and never
// responds is aborted and mapped to 504 `gateway_timeout`.
//
// The tests build the model to hang, set a short `upstreamTimeoutMs`, and
// assert a prompt 504. The test is bounded by a real race so it terminates
// deterministically and never hangs CI.

import { describe, expect, it } from 'vitest';
import type { LanguageModelV4, LanguageModelV4StreamPart } from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';

/**
 * A model whose upstream call never resolves on its own. It honors
 * `abortSignal` so that IF the gateway imposed a server-side deadline, the
 * hung call would reject and map to 504. With no deadline, it only settles
 * when the client aborts.
 */
function createHangingModel(): LanguageModelV4 {
  const hang = (abortSignal?: AbortSignal) =>
    new Promise<never>((_, reject) => {
      if (abortSignal?.aborted) {
        reject(new DOMException('aborted', 'AbortError'));
        return;
      }
      abortSignal?.addEventListener(
        'abort',
        () => reject(new DOMException('aborted', 'AbortError')),
        { once: true },
      );
      // Never resolves otherwise.
    });

  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    defaultObjectGenerationMode: undefined,
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: (options: { abortSignal?: AbortSignal }) => hang(options.abortSignal),
    doStream: (options: { abortSignal?: AbortSignal }) =>
      // First-chunk read never completes — models the hung `peekStream` case.
      Promise.resolve({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          pull: () => hang(options.abortSignal),
        }),
      }),
  } as LanguageModelV4;
}

function makeAppWithHangingProvider(providerName: string) {
  const fakeProvider = { languageModel: () => createHangingModel() };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;
  return createApp({ registry, upstreamTimeoutMs: 100 });
}

/**
 * Race the app request against a short real timer. Resolves with the status
 * when the gateway responds, or `'no-response'` if the gateway is still
 * hanging after `ms`. This keeps the test deterministic regardless of whether
 * a timeout is ever implemented.
 */
async function statusOrHang(res: Promise<Response>, ms: number): Promise<number | 'no-response'> {
  return Promise.race([
    res.then((r) => r.status),
    new Promise<'no-response'>((resolve) => setTimeout(() => resolve('no-response'), ms)),
  ]);
}

describe('gateway integration — upstream timeout (G32)', () => {
  // An operator needs a server-side deadline: a provider that never responds
  // must be aborted and mapped to 504 gateway_timeout. With `upstreamTimeoutMs`
  // set, the gateway responds well inside the generous 300ms race window.
  it('maps a hung non-streaming upstream to 504 gateway_timeout', async () => {
    const app = makeAppWithHangingProvider('groq');
    const controller = new AbortController();
    const res = app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'groq/test-model',
        messages: [{ role: 'user', content: 'hi' }],
      }),
      signal: controller.signal,
    });

    const status = await statusOrHang(res, 300);
    // Free the hung upstream so the dangling promise settles after the test.
    controller.abort();
    await res.catch(() => undefined);

    expect(status).toBe(504);
  });

  // Same deadline expectation for streaming: a `doStream` whose first-chunk
  // read never completes must not leave the request hanging — the operator
  // deadline surfaces 504 before the first byte.
  it('maps a hung streaming upstream first-chunk read to 504 gateway_timeout', async () => {
    const app = makeAppWithHangingProvider('groq');
    const controller = new AbortController();
    const res = app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'groq/test-model',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      }),
      signal: controller.signal,
    });

    const status = await statusOrHang(res, 300);
    controller.abort();
    await res.catch(() => undefined);

    expect(status).toBe(504);
  });
});

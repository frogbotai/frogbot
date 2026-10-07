import type { LanguageModelV4, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';

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
    });

  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() {
      return Promise.resolve({});
    },
    doGenerate: (options: { abortSignal?: AbortSignal }) => hang(options.abortSignal),
    doStream: (options: { abortSignal?: AbortSignal }) =>
      Promise.resolve({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          pull: () => hang(options.abortSignal),
        }),
      }),
  };
}

function makeAppWithHangingProvider(providerName: string) {
  const fakeProvider = { languageModel: () => createHangingModel() };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;

  return createApp({ registry, upstreamTimeoutMs: 100 });
}

async function statusOrHang(res: Promise<Response>, ms: number): Promise<number | 'no-response'> {
  return Promise.race([
    res.then((r) => r.status),
    new Promise<'no-response'>((resolve) => setTimeout(() => resolve('no-response'), ms)),
  ]);
}

describe('gateway integration — upstream timeout (G32)', () => {
  it('maps a hung non-streaming upstream to 504 gateway_timeout', async () => {
    const app = makeAppWithHangingProvider('groq');
    const controller = new AbortController();
    const res = Promise.resolve(
      app.request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'groq/test-model',
          messages: [{ role: 'user', content: 'hi' }],
        }),
        signal: controller.signal,
      }),
    );

    const status = await statusOrHang(res, 300);
    controller.abort();
    await res.catch(() => undefined);

    expect(status).toBe(504);
  });

  it('maps a hung streaming upstream first-chunk read to 504 gateway_timeout', async () => {
    const app = makeAppWithHangingProvider('groq');
    const controller = new AbortController();
    const res = Promise.resolve(
      app.request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'groq/test-model',
          messages: [{ role: 'user', content: 'hi' }],
          stream: true,
        }),
        signal: controller.signal,
      }),
    );

    const status = await statusOrHang(res, 300);
    controller.abort();
    await res.catch(() => undefined);

    expect(status).toBe(504);
  });
});

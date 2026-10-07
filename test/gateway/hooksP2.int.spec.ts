import type {
  EmbeddingModelV4,
  LanguageModelV4,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import { createGateway } from '../../packages/gateway/src/gateway.js';
import type { BeforeUpstreamHookArgs, Hooks } from '../../packages/gateway/src/hooks.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';
import { finish, mockUsage } from './mockModel.js';

function makeLanguageModel(opts?: { error?: Error }): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() {
      return Promise.resolve({});
    },
    doGenerate: () => {
      if (opts?.error) return Promise.reject(opts.error);

      return Promise.resolve({
        content: [{ type: 'text' as const, text: 'hi' }],
        finishReason: finish('stop'),
        usage: mockUsage({
          inputTokens: { total: 2, noCache: 2 },
          outputTokens: { total: 1, text: 1 },
        }),
        warnings: [],
        response: { id: 'r1', modelId: 'mock-model', timestamp: new Date() },
      });
    },
    doStream: () =>
      Promise.resolve({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            if (opts?.error) {
              controller.enqueue({ type: 'error', error: opts.error });
            } else {
              controller.enqueue({ type: 'text-start', id: 'text-0' });

              controller.enqueue({
                type: 'text-delta',
                id: 'text-0',
                delta: 'hi',
              });

              controller.enqueue({ type: 'text-end', id: 'text-0' });

              controller.enqueue({
                type: 'finish',
                finishReason: finish('stop'),
                usage: mockUsage({
                  inputTokens: { total: 2, noCache: 2 },
                  outputTokens: { total: 1, text: 1 },
                }),
              });
            }

            controller.close();
          },
        }),
      }),
  };
}

function makeAppWithModel(model: LanguageModelV4, hooks?: Hooks) {
  const registry = { groq: { languageModel: () => model } } as unknown as ProviderRegistry;

  return createApp({ registry, hooks });
}

describe('G85 — gateway.hooks freeze is deep (HE8)', () => {
  it('Object.freeze on gateway.hooks deep-freezes the inner arrays', () => {
    const afterOpHook = () => {};

    const gw = createGateway({
      providers: { openai: { apiKey: 'sk-test' } },
      hooks: { afterOperation: [afterOpHook] },
    });

    expect(Object.isFrozen(gw.hooks)).toBe(true);

    const arr = gw.hooks.afterOperation!;

    expect(Object.isFrozen(arr)).toBe(true);

    const before = arr.length;

    expect(() => arr.push(() => {})).toThrow();
    expect(arr.length).toBe(before);
  });
});

describe('G86 — isClientAbort misclassifies upstream AbortError as 499 (HE9)', () => {
  it('upstream AbortError should not be classified as 499 client abort (G86)', async () => {
    const upstreamAbortError = new DOMException('upstream timeout', 'AbortError');
    const model = makeLanguageModel({ error: upstreamAbortError });
    const app = makeAppWithModel(model);

    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'groq/test',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    expect(res.status).not.toBe(499);
    expect(res.status).toBe(504);
  });
});

function makeEmbeddingModel(
  capture: (opts: Record<string, Record<string, unknown>> | undefined) => void,
): EmbeddingModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-embed-model',
    maxEmbeddingsPerCall: undefined,
    supportsParallelCalls: true,
    doEmbed: (options) => {
      capture(options.providerOptions);

      return Promise.resolve({
        embeddings: options.values.map(() => [0.1, 0.2, 0.3]),
        usage: { tokens: 4 },
        response: { headers: {} },
        warnings: [],
      });
    },
  };
}

describe('G87 — beforeUpstream contract on modality routes (HE12)', () => {
  it('omits dummy messages/params and honors providerOptions mutation on embeddings', async () => {
    let captured: BeforeUpstreamHookArgs | undefined;
    let providerOptsAtUpstream: Record<string, Record<string, unknown>> | undefined;
    const registry = {
      openai: {
        embeddingModel: () =>
          makeEmbeddingModel((o) => {
            providerOptsAtUpstream = o;
          }),
      },
    } as unknown as ProviderRegistry;

    const app = createApp({
      registry,
      hooks: {
        beforeUpstream: [
          (args) => {
            captured = args;
            args.providerOptions.openai = { ...args.providerOptions.openai, injected: true };
          },
        ],
      },
    });

    const { status } = await postJson(app, '/v1/embeddings', {
      model: 'openai/text-embedding-3-small',
      input: 'hello',
    });

    expect(status).toBe(200);
    expect(captured?.messages).toBeUndefined();
    expect(captured?.params).toBeUndefined();
    expect(providerOptsAtUpstream?.openai).toMatchObject({ injected: true });
  });
});

describe('G87 — system is read-only on the messages route (HE12)', () => {
  it('exposes system for inspection; mutating it does not alter the prompt', async () => {
    let capturedSystem: BeforeUpstreamHookArgs['system'];
    const model = makeLanguageModel();
    const registry = { groq: { languageModel: () => model } } as unknown as ProviderRegistry;
    const app = createApp({
      registry,
      hooks: {
        beforeUpstream: [
          (args) => {
            capturedSystem = args.system;
          },
        ],
      },
    });

    const { status } = await postJson(app, '/v1/messages', {
      model: 'groq/test',
      max_tokens: 16,
      system: 'be terse',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(200);
    expect(capturedSystem).toBe('be terse');
  });
});

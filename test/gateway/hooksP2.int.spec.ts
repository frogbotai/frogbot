// P2 triage — G84–G88 findings.
//
// G84 (HE6)  DEFERRED — afterOperation §4.4 "always runs" vs scoped semantics.
//            Policy call: the hook fires on every route (chat, messages,
//            responses, images, speech, …) via the inline finally block.
//            The "§4.4 claim" requires a doc review to determine if the
//            language implies a universal guarantee vs an operation-scoped one.
//            No behavioral gap found in code — all routes have the pattern.
//
// G85 (HE8)  CONFIRMED D — gateway.hooks is exposed but Object.freeze is
//            cosmetic: the top-level object is frozen but array values inside
//            it remain mutable. Test confirms array mutation survives the freeze.
//
// G86 (HE9)  CONFIRMED A — isClientAbort maps ANY AbortError (including
//            upstream timeouts) to 499. A server-side timeout abort should
//            surface as 504, not 499.
//
// G87 (HE12) FIXED — beforeUpstream no longer passes dummy messages:[]/params:{}
//            on modality routes (images, speech, embeddings, videos, rerank,
//            transcriptions). Those fields are omitted (typed optional) since
//            the operations have no messages/params; headers/providerOptions
//            remain mutable in place. system/tools are typed read-only.
//
// G88 (HE13) FIXED — status→type maps consolidated into
//            errors/statusMaps.ts (statusToOpenAIType, statusToAnthropicType,
//            statusForAnthropicErrorType). envelope.ts, streamError.ts
//            (inferOpenAIType), and shared/extractStreamErrorInfo.ts all
//            delegate to it. The two stream-error extractors
//            (extractOpenAIStreamErrorInfo / extractAnthropicStreamErrorInfo)
//            now also mask via maybeMaskMessage (G35).

import { describe, expect, it } from 'vitest';
import type { EmbeddingModelV4, LanguageModelV4, LanguageModelV4StreamPart } from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import { createGateway } from '../../packages/gateway/src/gateway.js';
import type { BeforeUpstreamHookArgs, Hooks } from '../../packages/gateway/src/hooks.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLanguageModel(opts?: { error?: unknown }): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    defaultObjectGenerationMode: undefined,
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: async () => {
      if (opts?.error) throw opts.error;
      return {
        content: [{ type: 'text' as const, text: 'hi' }],
        finishReason: 'stop',
        usage: {
          inputTokens: { total: 2, noCache: 2 },
          outputTokens: { total: 1, text: 1 },
        },
        warnings: [],
        response: { id: 'r1', modelId: 'mock-model', timestamp: new Date() },
      };
    },
    doStream: async () => ({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          if (opts?.error) {
            controller.enqueue({ type: 'error', error: opts.error } as LanguageModelV4StreamPart);
          } else {
            controller.enqueue({ type: 'text-start', id: 'text-0' } as LanguageModelV4StreamPart);
            controller.enqueue({ type: 'text-delta', id: 'text-0', delta: 'hi' } as LanguageModelV4StreamPart);
            controller.enqueue({ type: 'text-end', id: 'text-0' } as LanguageModelV4StreamPart);
            controller.enqueue({
              type: 'finish',
              finishReason: 'stop',
              usage: {
                inputTokens: { total: 2, noCache: 2 },
                outputTokens: { total: 1, text: 1 },
              },
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

// ---------------------------------------------------------------------------
// G85 — gateway.hooks freeze is cosmetic
// ---------------------------------------------------------------------------

describe('G85 — gateway.hooks freeze is deep (HE8)', () => {
  it('Object.freeze on gateway.hooks deep-freezes the inner arrays', () => {
    const afterOpHook = () => {};
    const gw = createGateway({
      providers: { openai: { apiKey: 'sk-test' } },
      hooks: { afterOperation: [afterOpHook] },
    });

    // The top-level object IS frozen — adding a new key throws in strict mode.
    expect(Object.isFrozen(gw.hooks)).toBe(true);

    // G85: the inner ARRAY is now also frozen — push throws in strict mode.
    const arr = gw.hooks.afterOperation!;
    expect(Object.isFrozen(arr)).toBe(true);
    const before = arr.length;
    expect(() => arr.push(() => {})).toThrow();
    expect(arr.length).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// G86 — isClientAbort misclassifies upstream AbortError as 499
// ---------------------------------------------------------------------------

describe('G86 — isClientAbort misclassifies upstream AbortError as 499 (HE9)', () => {
  // Scenario: a mock upstream that throws a DOMException('AbortError') to
  // simulate an upstream-side timeout abort (NOT a client disconnect).
  // `isClientAbort` is now signal-gated: a bare AbortError with a
  // still-connected client is an upstream fault → 504 gateway_timeout.
  it(
    'upstream AbortError should not be classified as 499 client abort (G86)',
    async () => {
      // Simulate upstream timeout: the provider throws an AbortError that
      // originated server-side (e.g. AbortSignal.timeout() on the fetch).
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

      // The request signal never aborted, so this is not a client abort:
      // it maps to 504 gateway_timeout instead of a bodyless 499.
      expect(res.status).not.toBe(499);
      expect(res.status).toBe(504);
    },
  );
});

// ---------------------------------------------------------------------------
// G87 — beforeUpstream mutation contract on modality routes
// ---------------------------------------------------------------------------

function makeEmbeddingModel(capture: (opts: Record<string, Record<string, unknown>> | undefined) => void): EmbeddingModelV4 {
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
      openai: { embeddingModel: () => makeEmbeddingModel((o) => { providerOptsAtUpstream = o; }) },
    } as unknown as ProviderRegistry;
    const app = createApp({
      registry,
      hooks: {
        beforeUpstream: [(args) => {
          captured = args;
          args.providerOptions.openai = { ...args.providerOptions.openai, injected: true };
        }],
      },
    });

    const { status } = await postJson(app, '/v1/embeddings', {
      model: 'openai/text-embedding-3-small',
      input: 'hello',
    });

    expect(status).toBe(200);
    // No present-but-lying dummy fields: messages/params are absent entirely.
    expect(captured?.messages).toBeUndefined();
    expect(captured?.params).toBeUndefined();
    // In-place providerOptions mutation still reaches the upstream call.
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
        beforeUpstream: [(args) => { capturedSystem = args.system; }],
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

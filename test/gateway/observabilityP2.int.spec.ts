// P2 observability findings — G95, G101, G103.
//
// G95  — token metrics always emit 4 partitioned points (even when all cache
//        fields are 0) instead of falling back to 2 bare points. Zero-value
//        cache partitions pollute dashboards with meaningless series.
// G101 — pre-resolution failures (schema 400s, provider-not-found 404s) produce
//        zero log lines. The loggingHooks only fire at `beforeUpstream` and
//        later; failures that escape to `app.onError` are silently swallowed.
// G103 — `x-request-id` is accepted verbatim without sanitisation, so a client
//        can inject an arbitrary string that becomes the span-map key and the
//        echoed response header.

import { describe, expect, it } from 'vitest';
import type { LanguageModelV4, LanguageModelV4StreamPart } from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import type { LogFn, GatewayLogger } from '../../packages/gateway/src/observability/logger.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeModel(opts: { text?: string } = {}): LanguageModelV4 {
  const text = opts.text ?? 'hi';
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: () => Promise.resolve({
      content: [{ type: 'text', text }],
      finishReason: 'stop',
      usage: {
        inputTokens: { total: 10, noCache: 10 },
        outputTokens: { total: 5, text: 5 },
      },
      warnings: [],
      response: { id: 'r1', modelId: 'mock-model', timestamp: new Date('2026-01-01') },
    }),
    doStream: () => Promise.resolve({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          controller.enqueue({ type: 'text-start', id: 't0' } as LanguageModelV4StreamPart);
          controller.enqueue({ type: 'text-delta', id: 't0', delta: text } as LanguageModelV4StreamPart);
          controller.enqueue({ type: 'text-end', id: 't0' } as LanguageModelV4StreamPart);
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: { total: 10, noCache: 10 },
              outputTokens: { total: 5, text: 5 },
            },
          } as LanguageModelV4StreamPart);
          controller.close();
        },
      }),
    }),
  };
}

function makeApp(hooks = {}) {
  const registry = { openai: { languageModel: () => makeModel() } } as unknown as ProviderRegistry;
  return createApp({ registry, hooks });
}

// ---------------------------------------------------------------------------
// G95 — token metrics always partition even when cache is zero (D-class)
// ---------------------------------------------------------------------------
// G95 is D-class (code-fact confirmed by source inspection):
// `recordGenAiTokenUsage` in genAi.ts unconditionally calls histogram.record()
// 4× (lines 38-41): cacheRead, uncachedInput, reasoningOutput, textOutput.
// When cacheRead=0 and reasoningOutput=0 these emit zero-value histogram points
// with cache/reasoning partition labels, polluting dashboards with meaningless
// series. No runtime test is required for a D-class finding; this describe
// block is present for tracking only.
//
// Evidence: genAi.ts:38-41 — four unconditional .record() calls, even when
// `cacheRead` and `reasoningOutput` are both 0.

describe('G95 — token usage always partitioned (D-class, code-fact)', () => {
  it('CONFIRMED by source: genAi.ts emits 4 histogram points unconditionally (tracked, no runtime assertion)', () => {
    // D-class — verdict recorded here, no runtime assertion needed.
    // Fix: gate each .record() call on value > 0.
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// G101 — pre-resolution failures produce zero log lines
// ---------------------------------------------------------------------------

describe('G101 — pre-resolution failures produce zero log lines', () => {
  // A schema-validation 400 (malformed body) throws before `base` is set.
  // It escapes to `app.onError` which returns a JSON 400 but calls no logger.
  // `createLoggingHooks` only fires `beforeUpstream` and later — so this
  // failure is completely silent in the log stream.
  it('logs at least one line for a schema-validation 400', async () => {
    const logLines: Array<{ level: string; msg?: string }> = [];
    const capture: LogFn = (first, msg) => {
      if (typeof first === 'string') {
        logLines.push({ level: 'unknown', msg: first });
      } else {
        logLines.push({ level: (first as { level?: string }).level ?? 'unknown', msg });
      }
    };
    const logger: GatewayLogger = {
      trace: capture, debug: capture, info: capture, warn: capture, error: capture, fatal: capture,
    };
    const registry = { openai: { languageModel: () => makeModel() } } as unknown as ProviderRegistry;
    const app = createApp({ registry, logger });

    // Sending a body that fails Zod schema: missing required `messages` field.
    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4o' }),
    });

    expect(res.status).toBe(400);
    // G101: the gateway should log the 400 at error or warn level.
    expect(logLines.length).toBeGreaterThan(0);
  });

  it('logs at least one line for a provider-not-found 404', async () => {
    const logLines: Array<{ level: string; msg?: string }> = [];
    const capture: LogFn = (first, msg) => {
      if (typeof first === 'string') {
        logLines.push({ level: 'unknown', msg: first });
      } else {
        logLines.push({ level: (first as { level?: string }).level ?? 'unknown', msg });
      }
    };
    const logger: GatewayLogger = {
      trace: capture, debug: capture, info: capture, warn: capture, error: capture, fatal: capture,
    };
    const registry = { openai: { languageModel: () => makeModel() } } as unknown as ProviderRegistry;
    const app = createApp({ registry, logger });

    // Provider `badprovider` is not in the registry → ProviderNotConfiguredError.
    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'badprovider/some-model', messages: [{ role: 'user', content: 'hi' }] }),
    });

    expect(res.status).toBe(404);
    // G101: the gateway should log the not-found error.
    expect(logLines.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// G103 — x-request-id accepted verbatim without sanitisation
// ---------------------------------------------------------------------------

describe('G103 — x-request-id injection: no sanitisation or prefix', () => {
  // An inbound `x-request-id` with a path-traversal-shaped value is echoed
  // verbatim in the response header. No `req_` prefix is applied, and no
  // charset/length validation is performed.
  it('sanitises / rejects a path-traversal-shaped x-request-id', async () => {
    const app = makeApp();
    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': '../../evil',
      },
      body: JSON.stringify({ model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hi' }] }),
    });

    const echoed = res.headers.get('x-request-id') ?? '';
    // G103: the echoed ID must not contain path-traversal sequences.
    expect(echoed).not.toContain('..');
    // And must be normalised to a safe charset. The gateway generates bare
    // UUIDs via crypto.randomUUID() (requestId.ts:7) — no `req_` prefix is a
    // gateway/OpenAI contract, so we assert only a safe charset (alphanumeric,
    // dash, underscore), which any sound sanitisation of untrusted input and
    // the gateway's own UUID output both satisfy. `../../evil` fails this.
    expect(echoed).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  // Two concurrent requests both sending the SAME requestId: the span-map uses
  // requestId as key, so whichever span is stored first gets `.end()`-ed by the
  // second request's afterOperation hook — a wrong-span-end collision.
  it('isolates span-map entries when two requests share the same x-request-id', async () => {
    const ended: string[] = [];
    const spans: Record<string, unknown> = {};

    const app = makeApp();

    // Fire two requests concurrently with the SAME request-id.
    const id = 'collision-test-id';
    const [res1, res2] = await Promise.all([
      app.request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': id },
        body: JSON.stringify({ model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'req1' }] }),
      }),
      app.request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': id },
        body: JSON.stringify({ model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'req2' }] }),
      }),
    ]);

    // G103: both requests should succeed and have DISTINCT request-ids echoed,
    // meaning the gateway must not allow externally-supplied IDs to collide.
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    const id1 = res1.headers.get('x-request-id');
    const id2 = res2.headers.get('x-request-id');
    expect(id1).not.toBe(id2);

    void ended;
    void spans;
  });
});

// Gateway streaming hook-lifecycle tests — proving two review findings at
// the public `app.request()` / `createApp()` seam.
//
//   G26 — `afterOperation` (the "always runs, even on error" billing/audit
//         slot) is silently skipped when the upstream stream REJECTS at the
//         reader level before emitting its first frame (a network-reset style
//         failure, not an in-band `{type:'error'}` part).
//   G30 — the `otel` attribute bag that hooks write into is documented as
//         "flushed to spans + metrics" and the built-in tracing hook flushes
//         it onto the request span in `afterOperation`.
//
// Both started as `it.fails(...)` red tests and were flipped green when the
// findings were fixed.

import { describe, expect, it, vi } from 'vitest';
import type { Span, Tracer } from '@opentelemetry/api';
import type { LanguageModelV4, LanguageModelV4StreamPart } from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import type { AfterErrorHookArgs, AfterOperationHookArgs, Hooks } from '../../packages/gateway/src/hooks.js';

function makeAppWithModel(providerName: string, model: LanguageModelV4, hooks?: Hooks) {
  const registry = { [providerName]: { languageModel: () => model } } as unknown as ProviderRegistry;
  return createApp({ registry, hooks });
}

/**
 * A streaming mock whose `doStream` resolves fine but whose returned
 * `ReadableStream` THROWS on its first `pull` — i.e. it rejects at the reader
 * level before emitting a single frame. This models a network reset / socket
 * error mid-connection, which the AI SDK propagates as a `fullStream` read
 * rejection (`controller.error`), NOT as an in-band `{type:'error'}` part.
 */
function createPreFirstByteRejectingStreamModel(error: unknown): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: () => Promise.reject(new Error('unused in streaming path')),
    doStream: () => Promise.resolve({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        pull() {
          // Reject at the reader level before any frame is enqueued.
          throw error;
        },
      }),
    }),
  };
}

function makeSpan() {
  return {
    attributes: {} as Record<string, unknown>,
    events: [] as unknown[],
    ended: false,
    addEvent() { return this as unknown as Span; },
    end() { this.ended = true; },
    recordException: vi.fn(),
    setAttribute(key: string, value: unknown) { this.attributes[key] = value; return this as unknown as Span; },
    setAttributes(attrs: Record<string, unknown>) { Object.assign(this.attributes, attrs); return this as unknown as Span; },
    setStatus: vi.fn(),
  };
}

function createNonStreamingMock(): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: () => Promise.resolve({
      content: [{ type: 'text', text: 'hi' }],
      finishReason: 'stop',
      usage: { inputTokens: { total: 5, noCache: 5 }, outputTokens: { total: 4, text: 4 } },
      warnings: [],
      response: { id: 'mock-resp-1', modelId: 'mock-model', timestamp: new Date('2026-01-01T00:00:00Z') },
    }),
    doStream: () => Promise.reject(new Error('unused in non-streaming path')),
  };
}

// ---------------------------------------------------------------------------
// G26 — afterOperation must still fire on a pre-first-byte reader-level
// stream rejection. Today it does not: the handler creates the lifecycle
// BEFORE peeking the stream, so the outer `finally` guard (`if (base &&
// !lifecycle)`) skips afterOperation, and the reader-level rejection never
// reaches onFinish/onAbort/onStreamDone either — the billing/audit slot is
// silently lost for an entire class of upstream failures.
// ---------------------------------------------------------------------------

describe('gateway streaming lifecycle — reader-level stream rejection (G26)', () => {
  // G26: chat streaming — a pre-first-byte reader rejection must still fire the
  // afterOperation billing/audit hook exactly once (it currently fires zero).
  it('chat: fires afterOperation once (not zero) when the stream rejects before the first byte', async () => {
    const afterErrorCalls: AfterErrorHookArgs[] = [];
    const afterOperationCalls: AfterOperationHookArgs[] = [];
    const error = Object.assign(new Error('ECONNRESET'), { statusCode: 502 });
    const model = createPreFirstByteRejectingStreamModel(error);

    const app = makeAppWithModel('groq', model, {
      afterError: [(args) => { afterErrorCalls.push(args); }],
      afterOperation: [(args) => { afterOperationCalls.push(args); }],
    });

    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'groq/test-model',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      }),
    });
    await res.text().catch(() => undefined);

    // The upstream failed before any byte reached the client → a pre-flight
    // 500, afterError fires once, and afterOperation — the always-runs
    // billing/audit slot — must still fire exactly once.
    expect(res.status).toBe(500);
    expect(afterErrorCalls).toHaveLength(1);
    expect(afterOperationCalls).toHaveLength(1);
  });

  // G26: messages streaming — same reader-level rejection, same lost
  // afterOperation on the Anthropic route (identical handler shape).
  it('messages: fires afterOperation once (not zero) when the stream rejects before the first byte', async () => {
    const afterErrorCalls: AfterErrorHookArgs[] = [];
    const afterOperationCalls: AfterOperationHookArgs[] = [];
    const error = Object.assign(new Error('ECONNRESET'), { statusCode: 502 });
    const model = createPreFirstByteRejectingStreamModel(error);

    const app = makeAppWithModel('anthropic', model, {
      afterError: [(args) => { afterErrorCalls.push(args); }],
      afterOperation: [(args) => { afterOperationCalls.push(args); }],
    });

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
    await res.text().catch(() => undefined);

    expect(res.status).toBe(500);
    expect(afterErrorCalls).toHaveLength(1);
    expect(afterOperationCalls).toHaveLength(1);
  });

  // G26: responses streaming — same reader-level rejection, same lost
  // afterOperation on the OpenAI Responses route.
  it('responses: fires afterOperation once (not zero) when the stream rejects before the first byte', async () => {
    const afterErrorCalls: AfterErrorHookArgs[] = [];
    const afterOperationCalls: AfterOperationHookArgs[] = [];
    const error = Object.assign(new Error('ECONNRESET'), { statusCode: 502 });
    const model = createPreFirstByteRejectingStreamModel(error);

    const app = makeAppWithModel('openai', model, {
      afterError: [(args) => { afterErrorCalls.push(args); }],
      afterOperation: [(args) => { afterOperationCalls.push(args); }],
    });

    const res = await app.request('http://localhost/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        input: 'hi',
        stream: true,
      }),
    });
    await res.text().catch(() => undefined);

    expect(res.status).toBe(500);
    expect(afterErrorCalls).toHaveLength(1);
    expect(afterOperationCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// G30 — an `otel` attribute a hook contributes is documented as flushed to
// spans + metrics; the built-in tracing hook spreads `args.otel` onto the
// request span in `afterOperation`, so operator-contributed attributes land
// on the exported span.
// ---------------------------------------------------------------------------

describe('gateway observability — otel bag flushed to spans (G30)', () => {
  // G30: an attribute a hook writes into the `otel` bag must appear on the
  // request span, flushed by the tracing hook's afterOperation.
  it('flushes a hook-contributed otel attribute onto the exported span', async () => {
    const span = makeSpan();
    const tracer = { startSpan: vi.fn(() => span) } as unknown as Tracer;
    const registry = { openai: { languageModel: () => createNonStreamingMock() } } as unknown as ProviderRegistry;

    const app = createApp({
      registry,
      tracer,
      // `required` ensures the tracing hook actually creates a span.
      signalLevel: 'required',
      hooks: {
        beforeUpstream: [(args) => { args.otel['frogbot.custom_attribute'] = 'from-hook'; }],
      },
    });

    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    expect(res.status).toBe(200);
    expect(span.ended).toBe(true);
    // The documented contract: hook-contributed otel attributes are flushed to
    // the span. Currently the tracing hook ignores `args.otel` entirely.
    expect(span.attributes['frogbot.custom_attribute']).toBe('from-hook');
  });
});

// Gateway AI SDK telemetry activation (G100) — proving at the public
// `createApp()` seam that the gateway passes the v7 `telemetry` option to the
// AI SDK with the gateway tracer wired through, so SDK inner spans
// (`invoke_agent ...`, step and model-call spans) are actually emitted — and
// that the resolved signal levels gate them off again.

import { describe, expect, it, vi } from 'vitest';
import type { Span, Tracer } from '@opentelemetry/api';
import type { LanguageModelV4 } from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';

function makeSpan() {
  return {
    attributes: {} as Record<string, unknown>,
    ended: false,
    addEvent() { return this as unknown as Span; },
    end() { this.ended = true; },
    recordException: vi.fn(),
    setAttribute(key: string, value: unknown) { this.attributes[key] = value; return this as unknown as Span; },
    setAttributes(attrs: Record<string, unknown>) { Object.assign(this.attributes, attrs); return this as unknown as Span; },
    setStatus: vi.fn(),
    spanContext() { return { traceId: '00000000000000000000000000000000', spanId: '0000000000000000', traceFlags: 0 }; },
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

function makeApp(signalLevel: 'full' | 'required', spanNames: string[]) {
  const tracer = {
    startSpan: vi.fn((name: string) => {
      spanNames.push(name);
      return makeSpan();
    }),
  } as unknown as Tracer;
  const registry = { openai: { languageModel: () => createNonStreamingMock() } } as unknown as ProviderRegistry;
  return createApp({ registry, tracer, signalLevel });
}

async function postChat(app: ReturnType<typeof createApp>) {
  return app.request('http://localhost/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    }),
  });
}

describe('gateway AI SDK telemetry activation (G100)', () => {
  // G100: at gen_ai 'full' the gateway must pass the AI SDK `telemetry` option
  // with the @ai-sdk/otel integration wired to the gateway tracer, so the SDK
  // emits its inner spans through it in addition to the gateway span.
  it('emits AI SDK inner spans through the gateway tracer at signal level full', async () => {
    const spanNames: string[] = [];
    const app = makeApp('full', spanNames);

    const res = await postChat(app);

    expect(res.status).toBe(200);
    expect(spanNames).toContain('gateway.chat.completions');
    // The SDK operation root span (`invoke_agent <model>`) proves telemetry
    // activation reached the AI SDK call.
    expect(spanNames.some((name) => name.startsWith('invoke_agent'))).toBe(true);
  });

  // The frogbot namespace below 'recommended' must gate SDK telemetry off:
  // only the gateway span is created.
  it('emits no AI SDK inner spans at signal level required', async () => {
    const spanNames: string[] = [];
    const app = makeApp('required', spanNames);

    const res = await postChat(app);

    expect(res.status).toBe(200);
    expect(spanNames).toContain('gateway.chat.completions');
    expect(spanNames.some((name) => name.startsWith('invoke_agent'))).toBe(false);
  });
});

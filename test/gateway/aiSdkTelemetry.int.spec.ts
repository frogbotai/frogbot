import type { LanguageModelV4 } from '@ai-sdk/provider';
import type { Span, Tracer } from '@opentelemetry/api';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { finish, mockUsage } from './mockModel.js';

function makeSpan() {
  return {
    attributes: {} as Record<string, unknown>,
    ended: false,
    addEvent() {
      return this as unknown as Span;
    },
    end() {
      this.ended = true;
    },
    recordException: vi.fn(),
    setAttribute(key: string, value: unknown) {
      this.attributes[key] = value;

      return this as unknown as Span;
    },
    setAttributes(attrs: Record<string, unknown>) {
      Object.assign(this.attributes, attrs);

      return this as unknown as Span;
    },
    setStatus: vi.fn(),
    spanContext() {
      return {
        traceId: '00000000000000000000000000000000',
        spanId: '0000000000000000',
        traceFlags: 0,
      };
    },
  };
}

function createNonStreamingMock(): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() {
      return Promise.resolve({});
    },
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: 'text', text: 'hi' }],
        finishReason: finish('stop'),
        usage: mockUsage({
          inputTokens: { total: 5, noCache: 5 },
          outputTokens: { total: 4, text: 4 },
        }),
        warnings: [],
        response: {
          id: 'mock-resp-1',
          modelId: 'mock-model',
          timestamp: new Date('2026-01-01T00:00:00Z'),
        },
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

  const registry = {
    openai: { languageModel: () => createNonStreamingMock() },
  } as unknown as ProviderRegistry;

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
  it('emits AI SDK inner spans through the gateway tracer at signal level full', async () => {
    const spanNames: string[] = [];
    const app = makeApp('full', spanNames);

    const res = await postChat(app);

    expect(res.status).toBe(200);
    expect(spanNames).toContain('gateway.chat.completions');
    expect(spanNames.some((name) => name.startsWith('invoke_agent'))).toBe(true);
  });

  it('emits no AI SDK inner spans at signal level required', async () => {
    const spanNames: string[] = [];
    const app = makeApp('required', spanNames);

    const res = await postChat(app);

    expect(res.status).toBe(200);
    expect(spanNames).toContain('gateway.chat.completions');
    expect(spanNames.some((name) => name.startsWith('invoke_agent'))).toBe(false);
  });
});

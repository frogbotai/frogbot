import type { Span, SpanOptions, Tracer } from '@opentelemetry/api';
import { describe, expect, it, vi } from 'vitest';

import type { BeforeUpstreamHookArgs } from '../hooks.js';
import { createGatewayTracer, createTracingHooks } from './tracing.js';

function makeArgs(): BeforeUpstreamHookArgs {
  return {
    phase: 'beforeUpstream',
    operation: 'responses',
    requestId: 'req_123',
    model: 'openai/gpt-4o',
    provider: 'openai',
    startedAt: 1,
    context: { tenantId: 'tenant_1', apiKey: { id: 'key_1' } },
    otel: {},
    messages: [],
    params: {},
    headers: new Headers(),
    providerOptions: {},
  };
}

function makeSpan() {
  return {
    attributes: {} as Record<string, unknown>,
    events: [] as Array<{ name: string; attributes?: Record<string, unknown> }>,
    ended: false,
    addEvent(name: string, attributes?: Record<string, unknown>) {
      this.events.push({ name, attributes });
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
    setAttributes(attributes: Record<string, unknown>) {
      Object.assign(this.attributes, attributes);
      return this as unknown as Span;
    },
    setStatus: vi.fn(),
  };
}

describe('tracing', () => {
  it('is a no-op without a host-provided tracer or registered provider', async () => {
    const hooks = createTracingHooks({ signalLevel: 'required' });
    const args = makeArgs();

    await expect(
      (async () => {
        await hooks.beforeOperation?.[0]?.({
          phase: 'beforeOperation',
          operation: args.operation,
          requestId: args.requestId,
          startedAt: args.startedAt,
          context: args.context,
          otel: args.otel,
          request: new Request('https://gateway.test/v1/responses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trace: 'full' }) }),
        });
        await hooks.beforeUpstream?.[0]?.(args);
        await hooks.afterError?.[0]?.({
          phase: 'afterError',
          operation: args.operation,
          requestId: args.requestId,
          startedAt: args.startedAt,
          context: args.context,
          otel: args.otel,
          model: args.model,
          provider: args.provider,
          failedPhase: 'beforeUpstream',
          error: new Error('boom'),
        });
        await hooks.afterOperation?.[0]?.({
          phase: 'afterOperation',
          operation: args.operation,
          requestId: args.requestId,
          startedAt: args.startedAt,
          context: args.context,
          otel: args.otel,
          model: args.model,
          provider: args.provider,
          durationMs: 12,
          finishReason: 'stop',
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        });
      })(),
    ).resolves.toBeUndefined();
  });

  it('auto-tags decorated spans with auth context', () => {
    const span = makeSpan();
    const tracer = createGatewayTracer({ tracer: { startSpan: vi.fn(() => span) } as unknown as Tracer });
    tracer.startSpan('test', undefined, { getValue: () => makeArgs() } as never);
    expect(span.attributes).toMatchObject({ 'tenant.id': 'tenant_1', 'api_key.id': 'key_1' });
  });

  it('creates request spans, emits warning events, and ends without route branches', async () => {
    const span = makeSpan();
    const hooks = createTracingHooks({
      tracer: { startSpan: vi.fn((_name: string, _options?: SpanOptions) => span) } as unknown as Tracer,
    });
    const args = makeArgs();

    await hooks.beforeOperation?.[0]?.({
      phase: 'beforeOperation',
      operation: args.operation,
      requestId: args.requestId,
      startedAt: args.startedAt,
      context: args.context,
      otel: args.otel,
      request: new Request('https://gateway.test/v1/responses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trace: 'full' }) }),
    });
    await hooks.beforeUpstream?.[0]?.(args);
    await hooks.afterUpstream?.[0]?.({
      phase: 'afterUpstream',
      operation: args.operation,
      requestId: args.requestId,
      startedAt: args.startedAt,
      context: args.context,
      otel: args.otel,
      model: args.model,
      provider: args.provider,
      warnings: [{ type: 'other', message: 'careful' }],
    });
    await hooks.afterOperation?.[0]?.({
      phase: 'afterOperation',
      operation: args.operation,
      requestId: args.requestId,
      startedAt: args.startedAt,
      context: args.context,
      otel: args.otel,
      model: args.model,
      provider: args.provider,
      durationMs: 12,
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    });

    expect(span.events).toEqual([{ name: 'ai.sdk.warning', attributes: { warning: JSON.stringify({ type: 'other', message: 'careful' }) } }]);
    expect(span.attributes).toMatchObject({ 'tenant.id': 'tenant_1', 'api_key.id': 'key_1' });
    expect(span.ended).toBe(true);
  });

  it('honors trace off without creating a request span', async () => {
    const startSpan = vi.fn(() => makeSpan());
    const hooks = createTracingHooks({ tracer: { startSpan } as unknown as Tracer });
    const args = makeArgs();

    await hooks.beforeOperation?.[0]?.({
      phase: 'beforeOperation',
      operation: args.operation,
      requestId: args.requestId,
      startedAt: args.startedAt,
      context: args.context,
      otel: args.otel,
      request: new Request('https://gateway.test/v1/responses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trace: false }) }),
    });
    await hooks.beforeUpstream?.[0]?.(args);

    expect(startSpan).not.toHaveBeenCalled();
  });

  it('keeps overrides on the request context so abandoned requests leave no module-level state', async () => {
    const startSpan = vi.fn(() => makeSpan());
    const hooks = createTracingHooks({ tracer: { startSpan } as unknown as Tracer });
    const abandoned = makeArgs();

    await hooks.beforeOperation?.[0]?.({
      phase: 'beforeOperation',
      operation: abandoned.operation,
      requestId: abandoned.requestId,
      startedAt: abandoned.startedAt,
      context: abandoned.context,
      otel: abandoned.otel,
      request: new Request('https://gateway.test/v1/responses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trace: false }) }),
    });
    expect(abandoned.context['frogbot.gateway.traceOverride']).toBe('off');

    const reused = makeArgs();
    await hooks.beforeUpstream?.[0]?.(reused);

    expect(startSpan).toHaveBeenCalledOnce();
  });

  it('records the full error on the span in non-production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const span = makeSpan();
      const hooks = createTracingHooks({ tracer: { startSpan: vi.fn(() => span) } as unknown as Tracer });
      const args = makeArgs();

      await hooks.beforeUpstream?.[0]?.(args);
      const error = new Error('leaked sk-secret-123');
      await hooks.afterError?.[0]?.({
        phase: 'afterError',
        operation: args.operation,
        requestId: args.requestId,
        startedAt: args.startedAt,
        context: args.context,
        otel: args.otel,
        model: args.model,
        provider: args.provider,
        failedPhase: 'beforeUpstream',
        error,
      });

      expect(span.recordException).toHaveBeenCalledWith(error);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('records only the error name/type in production, stripping message and stack', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const span = makeSpan();
      const hooks = createTracingHooks({ tracer: { startSpan: vi.fn(() => span) } as unknown as Tracer });
      const args = makeArgs();

      await hooks.beforeUpstream?.[0]?.(args);
      const error = Object.assign(new Error('leaked sk-secret-123'), { name: 'ProviderError' });
      await hooks.afterError?.[0]?.({
        phase: 'afterError',
        operation: args.operation,
        requestId: args.requestId,
        startedAt: args.startedAt,
        context: args.context,
        otel: args.otel,
        model: args.model,
        provider: args.provider,
        failedPhase: 'beforeUpstream',
        error,
      });

      expect(span.recordException).toHaveBeenCalledWith({ name: 'ProviderError' });
      const recorded = (span.recordException as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0];
      expect(JSON.stringify(recorded)).not.toContain('sk-secret-123');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('skips the body parse when every base signal level is off', async () => {
    const hooks = createTracingHooks({ signalLevel: 'off' });
    const args = makeArgs();
    const request = new Request('https://gateway.test/v1/responses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trace: 'full' }) });
    const clone = vi.spyOn(request, 'clone');

    await hooks.beforeOperation?.[0]?.({
      phase: 'beforeOperation',
      operation: args.operation,
      requestId: args.requestId,
      startedAt: args.startedAt,
      context: args.context,
      otel: args.otel,
      request,
    });

    expect(clone).not.toHaveBeenCalled();
    // A per-request `trace: full` can't upgrade from an all-off baseline.
    expect(args.context['frogbot.gateway.traceOverride']).toBe('off');
  });

  it('parses the body when at least one base signal level is not off', async () => {
    const hooks = createTracingHooks({ signalLevel: { gen_ai: 'off', http: 'off', frogbot: 'required' } });
    const args = makeArgs();
    const request = new Request('https://gateway.test/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ trace: 'full' }),
    });
    const clone = vi.spyOn(request, 'clone');

    await hooks.beforeOperation?.[0]?.({
      phase: 'beforeOperation',
      operation: args.operation,
      requestId: args.requestId,
      startedAt: args.startedAt,
      context: args.context,
      otel: args.otel,
      request,
    });

    expect(clone).toHaveBeenCalledOnce();
    expect(args.context['frogbot.gateway.traceOverride']).toBe('full');
  });

  it('skips the body parse for non-JSON (multipart) requests without re-buffering the upload', async () => {
    const hooks = createTracingHooks({ signalLevel: { gen_ai: 'off', http: 'off', frogbot: 'required' } });
    const args = makeArgs();
    const form = new FormData();
    form.append('file', new Blob(['x'.repeat(1024)], { type: 'audio/wav' }), 'audio.wav');
    const request = new Request('https://gateway.test/v1/audio/transcriptions', { method: 'POST', body: form });
    const clone = vi.spyOn(request, 'clone');

    await hooks.beforeOperation?.[0]?.({
      phase: 'beforeOperation',
      operation: args.operation,
      requestId: args.requestId,
      startedAt: args.startedAt,
      context: args.context,
      otel: args.otel,
      request,
    });

    expect(clone).not.toHaveBeenCalled();
    expect(args.context['frogbot.gateway.traceOverride']).toBeUndefined();
  });
});

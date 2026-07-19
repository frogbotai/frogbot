import { type Meter, type MeterProvider, metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  DataPointType,
  type HistogramMetricData,
  InMemoryMetricExporter,
  MeterProvider as SdkMeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GatewayLogger } from './logger.js';

const ctx = { operation: 'responses' as const, model: 'openai/gpt-4o', provider: 'openai' };
const usage = { inputTokens: 100, outputTokens: 50, totalTokens: 150, cachedInputTokens: 20, reasoningTokens: 10 };

describe('genAi metrics', () => {
  beforeEach(() => {
    vi.resetModules();
    metrics.disable();
  });
  afterEach(() => {
    metrics.disable();
    vi.restoreAllMocks();
  });

  it('is a no-op without a registered MeterProvider and does not throw', async () => {
    const { recordGenAiTokenUsage } = await import('./genAi.js');
    expect(() => recordGenAiTokenUsage(ctx, usage, 'recommended')).not.toThrow();
  });

  it('lazily creates histograms only when recording (no work at import time)', async () => {
    const record = vi.fn();
    const createHistogram = vi.fn(() => ({ record }));
    const provider = { getMeter: () => ({ createHistogram }) as unknown as Meter } as unknown as MeterProvider;
    metrics.setGlobalMeterProvider(provider);

    const { recordGenAiTokenUsage } = await import('./genAi.js');

    // Importing the module must not create any histograms.
    expect(createHistogram).not.toHaveBeenCalled();

    recordGenAiTokenUsage(ctx, usage, 'recommended');

    expect(createHistogram).toHaveBeenCalledTimes(1);
    expect(createHistogram).toHaveBeenCalledWith('gen_ai.client.token.usage', { unit: '{token}' });
    // cache read(20), uncached input(80), reasoning output(10), non-reasoning output(40)
    expect(record).toHaveBeenCalledWith(20, expect.objectContaining({ 'gen_ai.token.type': 'input', 'gen_ai.token.cache': 'read' }));
    expect(record).toHaveBeenCalledWith(80, expect.objectContaining({ 'gen_ai.token.type': 'input', 'gen_ai.token.cache': 'uncached' }));
    expect(record).toHaveBeenCalledWith(10, expect.objectContaining({ 'gen_ai.token.type': 'output', 'gen_ai.token.reasoning': true }));
    expect(record).toHaveBeenCalledWith(40, expect.objectContaining({ 'gen_ai.token.type': 'output', 'gen_ai.token.reasoning': false }));
  });

  it('skips recording when signal level is below recommended', async () => {
    const createHistogram = vi.fn(() => ({ record: vi.fn() }));
    metrics.setGlobalMeterProvider({ getMeter: () => ({ createHistogram }) as unknown as Meter });

    const { createGenAiHooks } = await import('./genAi.js');
    const hooks = createGenAiHooks('required');
    hooks.afterOperation?.[0]?.({
      phase: 'afterOperation',
      operation: ctx.operation,
      requestId: 'req_1',
      startedAt: 0,
      context: {},
      otel: {},
      model: ctx.model,
      provider: ctx.provider,
      durationMs: 1,
      finishReason: 'stop',
      usage,
    });

    expect(createHistogram).not.toHaveBeenCalled();
  });
});

type Point = { value: number; attributes: Record<string, unknown> };

describe('genAi metrics — real InMemoryMetricExporter pipeline', () => {
  let exporter: InMemoryMetricExporter;
  let reader: PeriodicExportingMetricReader;
  let provider: SdkMeterProvider;

  const collectPoints = async (metricName: string): Promise<Point[]> => {
    await reader.forceFlush();
    const histograms: HistogramMetricData[] = [];
    for (const rm of exporter.getMetrics()) {
      for (const sm of rm.scopeMetrics) {
        for (const metric of sm.metrics) {
          if (metric.descriptor.name === metricName && metric.dataPointType === DataPointType.HISTOGRAM) {
            histograms.push(metric);
          }
        }
      }
    }
    return histograms.flatMap((h) =>
      h.dataPoints
        .filter((dp) => (dp.value.count ?? 0) > 0)
        .map((dp) => ({ value: dp.value.sum ?? 0, attributes: { ...dp.attributes } })),
    );
  };

  const tokenPoints = () => collectPoints('gen_ai.client.token.usage');
  const inputPoints = async () => (await tokenPoints()).filter((p) => p.attributes['gen_ai.token.type'] === 'input');
  const outputPoints = async () => (await tokenPoints()).filter((p) => p.attributes['gen_ai.token.type'] === 'output');

  const makeLogger = () => {
    const warn = vi.fn();
    const logger = { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn, error: vi.fn(), fatal: vi.fn() } as unknown as GatewayLogger;
    return { logger, warn };
  };

  beforeAll(() => {
    exporter = new InMemoryMetricExporter(AggregationTemporality.DELTA);
    reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000, exportTimeoutMillis: 10_000 });
    provider = new SdkMeterProvider({ readers: [reader] });
    metrics.setGlobalMeterProvider(provider);
  });

  afterAll(async () => {
    await provider.shutdown();
    metrics.disable();
  });

  afterEach(() => {
    exporter.reset();
  });

  it('emits partitioned input and output points with values and attributes', async () => {
    const { recordGenAiTokenUsage } = await import('./genAi.js');
    recordGenAiTokenUsage(ctx, usage, 'recommended');

    const inputs = await inputPoints();
    const outputs = await outputPoints();

    expect(inputs).toContainEqual({
      value: 20,
      attributes: { 'gen_ai.operation.name': 'responses', 'gen_ai.request.model': 'openai/gpt-4o', 'gen_ai.system': 'openai', 'gen_ai.token.type': 'input', 'gen_ai.token.cache': 'read' },
    });
    expect(inputs).toContainEqual({
      value: 80,
      attributes: { 'gen_ai.operation.name': 'responses', 'gen_ai.request.model': 'openai/gpt-4o', 'gen_ai.system': 'openai', 'gen_ai.token.type': 'input', 'gen_ai.token.cache': 'uncached' },
    });
    expect(outputs).toContainEqual({
      value: 10,
      attributes: { 'gen_ai.operation.name': 'responses', 'gen_ai.request.model': 'openai/gpt-4o', 'gen_ai.system': 'openai', 'gen_ai.token.type': 'output', 'gen_ai.token.reasoning': true },
    });
    expect(outputs).toContainEqual({
      value: 40,
      attributes: { 'gen_ai.operation.name': 'responses', 'gen_ai.request.model': 'openai/gpt-4o', 'gen_ai.system': 'openai', 'gen_ai.token.type': 'output', 'gen_ai.token.reasoning': false },
    });
  });

  // RED at baseline: pre-fix silently clamped textOutput to 0 with no warning.
  it('clamps and warns on output sum-invariant violation (outputTokens < reasoningTokens)', async () => {
    const { recordGenAiTokenUsage } = await import('./genAi.js');
    const { logger, warn } = makeLogger();

    recordGenAiTokenUsage(ctx, { inputTokens: 100, outputTokens: 50, totalTokens: 150, reasoningTokens: 60 }, 'recommended', undefined, logger);

    const outputs = await outputPoints();
    const text = outputs.find((p) => p.attributes['gen_ai.token.reasoning'] === false);
    expect(text?.value ?? 0).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ outputTokens: 50, reasoningTokens: 60 }),
      expect.stringContaining('reasoning tokens exceed output total'),
    );
  });

  // RED at baseline: pre-fix silently clamped uncachedInput to 0 with no warning.
  it('clamps and warns on input sum-invariant violation (inputTokens < cachedInputTokens)', async () => {
    const { recordGenAiTokenUsage } = await import('./genAi.js');
    const { logger, warn } = makeLogger();

    recordGenAiTokenUsage(ctx, { inputTokens: 30, outputTokens: 10, totalTokens: 40, cachedInputTokens: 50 }, 'recommended', undefined, logger);

    const inputs = await inputPoints();
    const uncached = inputs.find((p) => p.attributes['gen_ai.token.cache'] === 'uncached');
    expect(uncached?.value ?? 0).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 30, cachedInputTokens: 50 }),
      expect.stringContaining('cached input tokens exceed input total'),
    );
  });

  // RED at baseline: pre-fix had no non-finite guard; NaN/Infinity poisoned the histogram.
  it('records 0 for non-finite token values without throwing or poisoning', async () => {
    const { recordGenAiTokenUsage } = await import('./genAi.js');

    expect(() =>
      recordGenAiTokenUsage(ctx, { inputTokens: Number.NaN, outputTokens: Infinity, totalTokens: Number.NaN, cachedInputTokens: Infinity, reasoningTokens: Number.NaN }, 'recommended'),
    ).not.toThrow();

    const inputs = await inputPoints();
    const outputs = await outputPoints();
    for (const p of [...inputs, ...outputs]) {
      expect(Number.isFinite(p.value)).toBe(true);
      expect(p.value).toBe(0);
    }
  });

  it('handles zero-token usage as all-zero points', async () => {
    const { recordGenAiTokenUsage } = await import('./genAi.js');
    recordGenAiTokenUsage(ctx, { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, 'recommended');

    const inputs = await inputPoints();
    const outputs = await outputPoints();
    for (const p of [...inputs, ...outputs]) {
      expect(p.value).toBe(0);
    }
  });

  it('emits bare (unpartitioned) points when no cache/reasoning breakdown is reported', async () => {
    const { recordGenAiTokenUsage } = await import('./genAi.js');
    recordGenAiTokenUsage(ctx, { inputTokens: 100, outputTokens: 50, totalTokens: 150 }, 'recommended');

    const inputs = await inputPoints();
    const outputs = await outputPoints();

    // No cache partition attributes at all — a single bare input point carrying the full total.
    expect(inputs).toHaveLength(1);
    expect(inputs[0].value).toBe(100);
    expect(inputs[0].attributes['gen_ai.token.cache']).toBeUndefined();

    // No reasoning partition attributes — a single bare output point.
    expect(outputs).toHaveLength(1);
    expect(outputs[0].value).toBe(50);
    expect(outputs[0].attributes['gen_ai.token.reasoning']).toBeUndefined();
  });

  it('emits a cache=creation partition point for cache-write tokens', async () => {
    const { recordGenAiTokenUsage } = await import('./genAi.js');
    recordGenAiTokenUsage(ctx, { inputTokens: 100, outputTokens: 50, totalTokens: 150, cachedInputTokens: 10, cacheWriteTokens: 20 }, 'recommended');

    const inputs = await inputPoints();

    expect(inputs.find((p) => p.attributes['gen_ai.token.cache'] === 'read')?.value).toBe(10);
    expect(inputs.find((p) => p.attributes['gen_ai.token.cache'] === 'creation')?.value).toBe(20);
    expect(inputs.find((p) => p.attributes['gen_ai.token.cache'] === 'uncached')?.value).toBe(70);
  });

  const durationPoints = () => collectPoints('gen_ai.server.request.duration');

  it('records request duration in seconds with the required gen_ai attributes', async () => {
    const { recordRequestDuration } = await import('./genAi.js');
    recordRequestDuration(ctx, 1500, undefined, 'recommended');

    const points = await durationPoints();
    expect(points).toHaveLength(1);
    expect(points[0].value).toBeCloseTo(1.5, 6);
    expect(points[0].attributes).toEqual({
      'gen_ai.operation.name': 'responses',
      'gen_ai.request.model': 'openai/gpt-4o',
      'gen_ai.system': 'openai',
    });
    expect(points[0].attributes['error.type']).toBeUndefined();
  });

  it('adds error.type derived from the error status when the operation failed', async () => {
    const { recordRequestDuration } = await import('./genAi.js');
    const { ModelNotFoundError } = await import('../errors/gatewayError.js');
    recordRequestDuration(ctx, 200, new ModelNotFoundError('openai/nope'), 'recommended');

    const points = await durationPoints();
    expect(points).toHaveLength(1);
    expect(points[0].attributes['error.type']).toBe('404 not found');
  });

  it('prefers the abort-effective status code from the otel bag for error.type', async () => {
    const { recordRequestDuration } = await import('./genAi.js');
    recordRequestDuration({ ...ctx, otel: { 'frogbot.status_code_effective': 499 } }, 200, undefined, 'recommended');

    const points = await durationPoints();
    expect(points).toHaveLength(1);
    expect(points[0].attributes['error.type']).toBe('499 error');
  });

  it('does not record duration when the gen_ai signal level is below recommended', async () => {
    const { recordRequestDuration } = await import('./genAi.js');
    recordRequestDuration(ctx, 1000, undefined, 'required');

    expect(await durationPoints()).toHaveLength(0);
  });
});

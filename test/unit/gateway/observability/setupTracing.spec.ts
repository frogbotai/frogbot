import type * as otelApi from '@opentelemetry/api';
import type { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findResolvedUrl = (root: object): string | undefined => {
  const seen = new Set<object>();
  const visit = (obj: unknown): string | undefined => {
    if (obj == null || typeof obj !== 'object' || seen.has(obj)) {
      return undefined;
    }

    seen.add(obj);

    for (const value of Object.values(obj as Record<string, unknown>)) {
      if (typeof value === 'string' && value.startsWith('http')) {
        return value;
      }

      if (value != null && typeof value === 'object') {
        const found = visit(value);
        if (found != null) {
          return found;
        }
      }
    }

    return undefined;
  };

  return visit(root);
};

const mockSetupModules = (captured: {
  exporterConfig?: { url?: string };
  exporterConstructed?: boolean;
  providerOptions?: { resource?: { attributes: Record<string, unknown> } };
}) => {
  vi.doMock('@opentelemetry/exporter-trace-otlp-http', () => ({
    OTLPTraceExporter: class {
      constructor(config: { url?: string } = {}) {
        captured.exporterConstructed = true;
        captured.exporterConfig = config;
      }
    },
  }));

  vi.doMock('@opentelemetry/sdk-trace-node', () => ({
    NodeTracerProvider: class {
      constructor(options: { resource?: { attributes: Record<string, unknown> } } = {}) {
        captured.providerOptions = options;
      }

      register() {}
      forceFlush() {
        return Promise.resolve();
      }

      shutdown() {
        return Promise.resolve();
      }
    },
  }));

  vi.doMock('@opentelemetry/sdk-trace-base', () => ({ BatchSpanProcessor: class {} }));

  vi.doMock('@opentelemetry/sdk-metrics', () => ({
    MeterProvider: class {
      forceFlush() {
        return Promise.resolve();
      }

      shutdown() {
        return Promise.resolve();
      }
    },
    PeriodicExportingMetricReader: class {},
  }));

  vi.doMock('@opentelemetry/exporter-metrics-otlp-http', () => ({ OTLPMetricExporter: class {} }));

  vi.doMock('@opentelemetry/context-async-hooks', () => ({
    AsyncLocalStorageContextManager: class {},
  }));

  vi.doMock('@opentelemetry/api', async (importOriginal) => {
    const actual = await importOriginal<typeof otelApi>();

    return {
      ...actual,
      context: { setGlobalContextManager() {} },
      metrics: { setGlobalMeterProvider() {} },
    };
  });
};

describe('setupTracing OTLP endpoint resolution (G28)', () => {
  const original = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    } else {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = original;
    }

    vi.restoreAllMocks();
  });

  it('resolves the exporter POST URL to /v1/traces when only the base OTLP endpoint env var is set', async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://otel-collector:4318';

    const captured: { exporterConfig?: { url?: string }; exporterConstructed?: boolean } = {};
    mockSetupModules(captured);

    const { setupTracing } =
      await import('../../../../packages/gateway/src/observability/setup.js');

    setupTracing();

    expect(captured.exporterConstructed).toBe(true);
    expect(captured.exporterConfig?.url).toBeUndefined();

    const actual = await vi.importActual<{ OTLPTraceExporter: typeof OTLPTraceExporter }>(
      '@opentelemetry/exporter-trace-otlp-http',
    );

    const real = new actual.OTLPTraceExporter(captured.exporterConfig);

    expect(findResolvedUrl(real)).toBe('http://otel-collector:4318/v1/traces');
  });

  it('passes an explicit endpoint option verbatim as the exporter url', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

    const captured: { exporterConfig?: { url?: string } } = {};
    mockSetupModules(captured);

    const { setupTracing } =
      await import('../../../../packages/gateway/src/observability/setup.js');

    setupTracing({ endpoint: 'http://collector.internal:4318/v1/traces' });

    expect(captured.exporterConfig?.url).toBe('http://collector.internal:4318/v1/traces');
  });

  it('warns the passed logger, not the console, when called a second time', async () => {
    mockSetupModules({});
    const warn = vi.fn();
    const logger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn,
      error: vi.fn(),
      fatal: vi.fn(),
    };

    const { setupTracing } =
      await import('../../../../packages/gateway/src/observability/setup.js');

    setupTracing({ logger });
    await setupTracing({ logger })();

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('setupTracing() called more than once'),
    );
  });
});

describe('setupTracing resource / service identity (G94)', () => {
  const originalServiceName = process.env.OTEL_SERVICE_NAME;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalServiceName === undefined) {
      delete process.env.OTEL_SERVICE_NAME;
    } else {
      process.env.OTEL_SERVICE_NAME = originalServiceName;
    }

    vi.restoreAllMocks();
  });

  it('gives the tracer provider a resource with the gateway service name, not unknown_service', async () => {
    delete process.env.OTEL_SERVICE_NAME;

    const captured: { providerOptions?: { resource?: { attributes: Record<string, unknown> } } } =
      {};

    mockSetupModules(captured);

    const { setupTracing } =
      await import('../../../../packages/gateway/src/observability/setup.js');

    setupTracing();

    const attributes = captured.providerOptions?.resource?.attributes;

    expect(attributes?.['service.name']).toBe('@frogbotai/gateway');
    expect(attributes?.['service.instance.id']).toEqual(expect.any(String));
    expect(attributes?.['deployment.environment.name']).toEqual(expect.any(String));
  });

  it('honors OTEL_SERVICE_NAME via env resource detection', async () => {
    process.env.OTEL_SERVICE_NAME = 'my-gateway';

    const captured: { providerOptions?: { resource?: { attributes: Record<string, unknown> } } } =
      {};

    mockSetupModules(captured);

    const { setupTracing } =
      await import('../../../../packages/gateway/src/observability/setup.js');

    setupTracing();

    expect(captured.providerOptions?.resource?.attributes['service.name']).toBe('my-gateway');
  });
});

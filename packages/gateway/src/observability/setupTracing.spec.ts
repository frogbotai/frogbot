import type * as otelApi from '@opentelemetry/api';
import type { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Walk the exporter object graph to find the resolved POST URL the transport
// will actually hit. On a real OTLPTraceExporter this lives at
// _delegate._transport._transport._parameters.url; we scan for it structurally
// so the assertion reflects what a collector receives, not a reimplementation
// of the SDK's URL rules.
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

// Hermetic module mocks: don't register real global providers or install
// process signal handlers as a side effect of setupTracing. The trace exporter
// mock captures the exact config setup.ts hands it; the tracer-provider mock
// captures the resource so G94 can assert service identity.
const mockSetupModules = (captured: { exporterConfig?: { url?: string }; exporterConstructed?: boolean; providerOptions?: { resource?: { attributes: Record<string, unknown> } } }) => {
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
      forceFlush() { return Promise.resolve(); }
      shutdown() { return Promise.resolve(); }
    },
  }));
  vi.doMock('@opentelemetry/sdk-trace-base', () => ({ BatchSpanProcessor: class {} }));
  vi.doMock('@opentelemetry/sdk-metrics', () => ({
    MeterProvider: class {
      forceFlush() { return Promise.resolve(); }
      shutdown() { return Promise.resolve(); }
    },
    PeriodicExportingMetricReader: class {},
  }));
  vi.doMock('@opentelemetry/exporter-metrics-otlp-http', () => ({ OTLPMetricExporter: class {} }));
  vi.doMock('@opentelemetry/context-async-hooks', () => ({ AsyncLocalStorageContextManager: class {} }));
  // Keep the real api surface (diag, createContextKey, ... — used by the real
  // @opentelemetry/resources at import time) but neuter the global registration
  // side effects.
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

  // An operator setting only OTEL_EXPORTER_OTLP_ENDPOINT (the standard base URL
  // with no path, e.g. from docker-compose/K8s) expects spans to POST to the
  // spec-mandated .../v1/traces path. setup.ts must NOT read that env var in
  // app code and hand it to the exporter as an explicit `url` (which the SDK
  // uses verbatim, defeating the /v1/traces append) — it must leave `url`
  // unset so the exporter's own env handling appends the signal path. This
  // captures the exact `url` setupTracing gives OTLPTraceExporter, builds a
  // real exporter the same way, and reads the URL its transport will POST to.
  it('resolves the exporter POST URL to /v1/traces when only the base OTLP endpoint env var is set', async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://otel-collector:4318';

    const captured: { exporterConfig?: { url?: string }; exporterConstructed?: boolean } = {};
    mockSetupModules(captured);

    const { setupTracing } = await import('./setup.js');
    setupTracing();

    expect(captured.exporterConstructed).toBe(true);
    // No config-level url: the env var must flow through the exporter's own
    // env handling (which appends the signal path), not app code.
    expect(captured.exporterConfig?.url).toBeUndefined();

    // Build a REAL exporter with the SAME config setup.ts passed, then read
    // the URL its transport will actually POST spans to.
    const actual = await vi.importActual<{ OTLPTraceExporter: typeof OTLPTraceExporter }>('@opentelemetry/exporter-trace-otlp-http');
    const real = new actual.OTLPTraceExporter(captured.exporterConfig);
    expect(findResolvedUrl(real)).toBe('http://otel-collector:4318/v1/traces');
  });

  // An explicit endpoint option is documented as a FULL signal URL and must be
  // passed verbatim.
  it('passes an explicit endpoint option verbatim as the exporter url', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

    const captured: { exporterConfig?: { url?: string } } = {};
    mockSetupModules(captured);

    const { setupTracing } = await import('./setup.js');
    setupTracing({ endpoint: 'http://collector.internal:4318/v1/traces' });

    expect(captured.exporterConfig?.url).toBe('http://collector.internal:4318/v1/traces');
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

  // Without a resource, SDK 2.x defaults every span to service.name
  // `unknown_service:node` and silently ignores OTEL_SERVICE_NAME. The
  // provider must receive a resource with a real gateway identity.
  it('gives the tracer provider a resource with the gateway service name, not unknown_service', async () => {
    delete process.env.OTEL_SERVICE_NAME;

    const captured: { providerOptions?: { resource?: { attributes: Record<string, unknown> } } } = {};
    mockSetupModules(captured);

    const { setupTracing } = await import('./setup.js');
    setupTracing();

    const attributes = captured.providerOptions?.resource?.attributes;
    expect(attributes?.['service.name']).toBe('@frogbotai/gateway');
    expect(attributes?.['service.instance.id']).toEqual(expect.any(String));
    expect(attributes?.['deployment.environment.name']).toEqual(expect.any(String));
  });

  // The standard env var must win over the built-in default.
  it('honors OTEL_SERVICE_NAME via env resource detection', async () => {
    process.env.OTEL_SERVICE_NAME = 'my-gateway';

    const captured: { providerOptions?: { resource?: { attributes: Record<string, unknown> } } } = {};
    mockSetupModules(captured);

    const { setupTracing } = await import('./setup.js');
    setupTracing();

    expect(captured.providerOptions?.resource?.attributes['service.name']).toBe('my-gateway');
  });
});

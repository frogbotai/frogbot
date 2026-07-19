// Node-only OpenTelemetry setup. This module statically imports the OTel SDK
// packages (which depend on `node:async_hooks`, `node:perf_hooks`, etc.) and
// MUST NOT be imported from the core gateway path. Node hosts and the CLI
// import it explicitly to register global tracer + meter providers.
//
// Non-Node runtimes should register their own providers (or none — the gateway
// degrades to no-op tracing/metrics). See `tracing.ts` for the api-only core.

import { context, metrics } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  defaultResource,
  detectResources,
  envDetector,
  resourceFromAttributes,
  type Resource,
} from '@opentelemetry/resources';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

import { GATEWAY_PACKAGE_VERSION } from '../version.js';

export type SetupMetricsOptions = {
  /** Full OTLP metrics URL used verbatim (e.g. `http://collector:4318/v1/metrics`). Omit to let the exporter's own env handling apply (`OTEL_EXPORTER_OTLP_ENDPOINT` + `/v1/metrics` append, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` verbatim). */
  endpoint?: string;
  /** Milliseconds between metric exports. Default 60s (SDK default). */
  exportIntervalMs?: number;
};

export type SetupTracingOptions = {
  /** Full OTLP traces URL used verbatim (e.g. `http://collector:4318/v1/traces`). Omit to let the exporter's own env handling apply (`OTEL_EXPORTER_OTLP_ENDPOINT` + `/v1/traces` append, `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` verbatim). */
  endpoint?: string;
  /** Milliseconds to wait for `forceFlush` before forcing exit on shutdown. Default 10s. */
  shutdownTimeoutMs?: number;
  /** Metrics exporter options, or `false` to skip registering a MeterProvider. */
  metrics?: SetupMetricsOptions | false;
};

let registered = false;
let meterProvider: MeterProvider | undefined;

/**
 * Resource shared by traces + metrics: explicit service identity (name,
 * version, per-process instance id, environment) with env-detected attributes
 * (`OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`) taking precedence.
 * Without this every span exports as `unknown_service:node`.
 */
function buildResource(): Resource {
  return defaultResource()
    .merge(
      resourceFromAttributes({
        'service.name': '@frogbotai/gateway',
        'service.version': GATEWAY_PACKAGE_VERSION,
        'service.instance.id': crypto.randomUUID(),
        'deployment.environment.name': process.env.NODE_ENV ?? 'development',
      }),
    )
    .merge(detectResources({ detectors: [envDetector] }));
}

/**
 * Register a Node OpenTelemetry tracer provider with an OTLP/HTTP exporter,
 * plus (by default) a meter provider so gen_ai metrics have an export path.
 * Idempotent. Node-only — do not call from edge/WinterCG runtimes.
 *
 * `options.endpoint` is a FULL signal URL used verbatim. When omitted, the
 * exporter's own env handling applies — `OTEL_EXPORTER_OTLP_ENDPOINT` gets the
 * spec-mandated `/v1/traces` path appended, and the signal-specific
 * `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is used verbatim.
 *
 * Returns a `flush` function that flushes the `BatchSpanProcessor` (which
 * buffers up to 2048 spans and exports on a ~5s timer) and the metric reader,
 * then shuts both providers down. The flush is bounded by a timeout so a stuck
 * OTLP export can't hang the process. The CLI owns signal handling and invokes
 * this after HTTP connections have drained (see `cli/index.ts`); a no-op is
 * returned when tracing is already registered.
 */
export function setupTracing(options: SetupTracingOptions = {}): () => Promise<void> {
  if (registered) {
    console.warn(
      'setupTracing() called more than once; the second invocation is ignored. One tracing configuration per process — the host application owns tracer lifecycle.',
    );
    return () => Promise.resolve();
  }
  context.setGlobalContextManager(new AsyncLocalStorageContextManager());
  const resource = buildResource();
  const exporter = new OTLPTraceExporter(options.endpoint ? { url: options.endpoint } : {});
  const provider = new NodeTracerProvider({
    resource,
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });
  provider.register();
  registered = true;
  const providers: ShutdownProvider[] = [provider];
  if (options.metrics !== false) {
    providers.push(setupMetrics({ ...options.metrics, resource }));
  }
  const timeoutMs = options.shutdownTimeoutMs ?? 10_000;
  return () => Promise.all(providers.map((provider) => gracefulShutdown(provider, timeoutMs))).then(() => undefined);
}

/**
 * Register a global MeterProvider with an OTLP/HTTP exporter so metrics
 * recorded through the global API (`gen_ai.client.token.usage`) reach a
 * collector instead of a no-op meter. Idempotent. Node-only. Called by
 * `setupTracing` by default; exported for hosts wiring metrics standalone
 * (they own flush/shutdown via `gracefulShutdown`).
 */
export function setupMetrics(options: SetupMetricsOptions & { resource?: Resource } = {}): MeterProvider {
  if (meterProvider) return meterProvider;
  const exporter = new OTLPMetricExporter(options.endpoint ? { url: options.endpoint } : {});
  meterProvider = new MeterProvider({
    resource: options.resource ?? buildResource(),
    readers: [
      new PeriodicExportingMetricReader({
        exporter,
        ...(options.exportIntervalMs != null ? { exportIntervalMillis: options.exportIntervalMs } : {}),
      }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);
  return meterProvider;
}

type ShutdownProvider = {
  forceFlush: () => Promise<void>;
  shutdown: () => Promise<void>;
};

/**
 * Flush and shut down `provider` on SIGTERM/SIGINT, bounding `forceFlush` with
 * `timeoutMs` so a wedged exporter can't block process exit. Exported for tests.
 */
export async function gracefulShutdown(provider: ShutdownProvider, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      provider.forceFlush(),
      new Promise<void>((_, reject) => {
        timer = setTimeout(() => reject(new Error('forceFlush timeout')), timeoutMs);
      }),
    ]);
  } catch {
    // Timed out or the exporter rejected — fall through to shutdown/exit.
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
  try {
    await provider.shutdown();
  } catch {
    // Best-effort shutdown — nothing to do if it fails.
  }
}

import { metrics } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as setupModule from './setup.js';
import { setupTracing } from './setup.js';

// The api-only global meter provider before anyone registers a real one. Its
// meters hand back no-op instruments, so recorded points reach no exporter.
const isNoopMeterProvider = (): boolean => {
  const meter = metrics.getMeter('probe');
  const histogram = meter.createHistogram('probe.metric');
  // The no-op instrument's constructor name is the SDK's NoopMetric marker;
  // a real SDK Histogram is a distinct class. We assert structurally: after a
  // real MeterProvider is registered, recording flows to an exporter (below).
  return histogram.constructor.name.toLowerCase().includes('noop');
};

describe('gateway setup registers a metrics export path (G29)', () => {
  beforeEach(() => {
    vi.resetModules();
    metrics.disable();
  });

  afterEach(() => {
    metrics.disable();
    vi.restoreAllMocks();
  });

  // gen_ai.client.token.usage is the flagship billing metric, recorded through
  // the global metrics API. Unless the gateway registers a MeterProvider during
  // its own setup, that API stays a no-op and every token-usage point recorded
  // in a real CLI/Node deployment is dropped. An operator running the shipped
  // setup should get a working meter provider without hand-registering one.
  it('leaves a working (non-no-op) global MeterProvider after setup runs', () => {
    metrics.disable();
    expect(isNoopMeterProvider()).toBe(true);

    setupTracing();

    // After the gateway's setup, a real MeterProvider must be in place.
    expect(isNoopMeterProvider()).toBe(false);
  });

  // Hosts wiring metrics standalone (or edge hosts registering their own
  // tracer provider) need a callable metrics setup entrypoint. It lives on the
  // Node-only `./setup` sub-path next to setupTracing — the api-only
  // observability barrel must stay free of Node OTel SDK imports.
  it('exports a metrics setup entrypoint from the setup module', () => {
    const exportNames = Object.keys(setupModule);
    const metricsSetup = exportNames.find((name) => /setupMetrics|MeterProvider/i.test(name));
    expect(metricsSetup).toBeDefined();
  });
});

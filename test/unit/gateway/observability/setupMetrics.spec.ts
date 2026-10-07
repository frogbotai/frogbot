import { metrics } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as setupModule from '../../../../packages/gateway/src/observability/setup.js';
import { setupTracing } from '../../../../packages/gateway/src/observability/setup.js';

const isNoopMeterProvider = (): boolean => {
  const meter = metrics.getMeter('probe');
  const histogram = meter.createHistogram('probe.metric');

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

  it('leaves a working (non-no-op) global MeterProvider after setup runs', () => {
    metrics.disable();

    expect(isNoopMeterProvider()).toBe(true);

    setupTracing();

    expect(isNoopMeterProvider()).toBe(false);
  });

  it('exports a metrics setup entrypoint from the setup module', () => {
    const exportNames = Object.keys(setupModule);
    const metricsSetup = exportNames.find((name) => /setupMetrics|MeterProvider/i.test(name));

    expect(metricsSetup).toBeDefined();
  });
});

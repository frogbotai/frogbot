import { describe, expect, it } from 'vitest';

import { buildRetryHeaders, isRetryableStatus } from './retryHeaders.js';

describe('isRetryableStatus', () => {
  it('marks 408/429/5xx as retryable', () => {
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(200)).toBe(false);
  });
});

describe('buildRetryHeaders', () => {
  it('sets x-should-retry=true and default retry-after for retryable statuses', () => {
    const h = buildRetryHeaders({ status: 429 });
    expect(h['x-should-retry']).toBe('true');
    expect(h['retry-after']).toBe('30');
    expect(h['retry-after-ms']).toBe('30000');
  });

  it('sets x-should-retry=false for non-retryable statuses without retry-after', () => {
    const h = buildRetryHeaders({ status: 400 });
    expect(h['x-should-retry']).toBe('false');
    expect(h['retry-after']).toBeUndefined();
  });

  it('forwards upstream retry-after verbatim and derives ms', () => {
    const h = buildRetryHeaders({
      status: 429,
      upstreamHeaders: { 'retry-after': '7' },
    });
    expect(h['retry-after']).toBe('7');
    expect(h['retry-after-ms']).toBe('7000');
  });

  it('preserves HTTP-date form of retry-after without inventing ms', () => {
    const httpDate = 'Wed, 21 Oct 2015 07:28:00 GMT';
    const h = buildRetryHeaders({
      status: 503,
      upstreamHeaders: { 'retry-after': httpDate },
    });
    expect(h['retry-after']).toBe(httpDate);
    // Non-numeric — no derived ms.
    expect(h['retry-after-ms']).toBeUndefined();
  });

  it('accepts upstream retry-after-ms and derives seconds', () => {
    const h = buildRetryHeaders({
      status: 429,
      upstreamHeaders: { 'retry-after-ms': '1500' },
    });
    expect(h['retry-after-ms']).toBe('1500');
    expect(h['retry-after']).toBe('2');
  });

  it('accepts Headers instance', () => {
    const upstream = new Headers({ 'Retry-After': '3' });
    const h = buildRetryHeaders({ status: 500, upstreamHeaders: upstream });
    expect(h['retry-after']).toBe('3');
    expect(h['retry-after-ms']).toBe('3000');
  });
});

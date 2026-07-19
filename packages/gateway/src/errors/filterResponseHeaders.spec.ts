import { describe, expect, it } from 'vitest';

import { filterResponseHeaders } from './filterResponseHeaders.js';

describe('filterResponseHeaders', () => {
  it('keeps allowlisted headers only', () => {
    const out = filterResponseHeaders({
      'retry-after': '5',
      'retry-after-ms': '5000',
      'x-should-retry': 'true',
      'x-request-id': 'req_123',
      'openai-organization': 'org_leak',
      'cf-ray': 'abc',
      'set-cookie': 'session=leak',
    });
    expect(out).toEqual({
      'retry-after': '5',
      'retry-after-ms': '5000',
      'x-should-retry': 'true',
      'x-request-id': 'req_123',
    });
  });

  it('lowercases keys and preserves case-insensitive matching', () => {
    const out = filterResponseHeaders({ 'Retry-After': '10', 'X-Should-Retry': 'true' });
    expect(out).toEqual({ 'retry-after': '10', 'x-should-retry': 'true' });
  });

  it('accepts Headers instance', () => {
    const h = new Headers({ 'Retry-After': '7', 'Set-Cookie': 'x=y' });
    expect(filterResponseHeaders(h)).toEqual({ 'retry-after': '7' });
  });

  it('returns empty object for undefined', () => {
    expect(filterResponseHeaders(undefined)).toEqual({});
  });
});

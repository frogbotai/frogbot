import { APICallError } from '@ai-sdk/provider';
import { RetryError } from 'ai';
import { describe, expect, it } from 'vitest';

import { headersForError, isRetryableError } from './normalizeAiSdkError.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const apiCallError = (overrides: Partial<ConstructorParameters<typeof APICallError>[0]> = {}) =>
  new APICallError({
    message: 'upstream failed',
    url: 'https://api.example.test/v1/x',
    requestBodyValues: {},
    ...overrides,
  });

// ---------------------------------------------------------------------------
// headersForError
// ---------------------------------------------------------------------------

describe('headersForError', () => {
  it('forwards retry-after from a plain APICallError', () => {
    const err = apiCallError({ statusCode: 429, responseHeaders: { 'retry-after': '12' } });
    const headers = headersForError(err, 429);
    expect(headers['retry-after']).toBe('12');
    expect(headers['x-should-retry']).toBe('true');
  });

  it('unwraps RetryError to forward the wrapped APICallError responseHeaders', () => {
    const wrapped = apiCallError({ statusCode: 429, responseHeaders: { 'retry-after': '45' } });
    const retryError = new RetryError({
      message: 'Failed after 3 attempts.',
      reason: 'maxRetriesExceeded',
      errors: [wrapped, wrapped, wrapped],
    });
    const headers = headersForError(retryError, 429);
    // Real upstream retry-after (45), not the synthesized default (30).
    expect(headers['retry-after']).toBe('45');
    expect(headers['x-should-retry']).toBe('true');
  });

  it('synthesizes a default retry-after when RetryError wraps a non-APICallError', () => {
    const retryError = new RetryError({
      message: 'Failed after 3 attempts with non-retryable error: boom',
      reason: 'errorNotRetryable',
      errors: [new Error('boom'), new Error('boom')],
    });
    const headers = headersForError(retryError, 502);
    expect(headers['retry-after']).toBe('5');
    expect(headers['x-should-retry']).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// isRetryableError
// ---------------------------------------------------------------------------

describe('isRetryableError', () => {
  it('returns true when the status itself is retryable', () => {
    expect(isRetryableError(new Error('boom'), 503)).toBe(true);
  });

  it('returns true for a plain retryable APICallError even at a non-retryable status', () => {
    const err = apiCallError({ statusCode: 429 });
    expect(isRetryableError(err, 200)).toBe(true);
  });

  it('unwraps RetryError to classify by the wrapped APICallError statusCode', () => {
    const wrapped = apiCallError({ statusCode: 429 });
    const retryError = new RetryError({
      message: 'Failed after 3 attempts.',
      reason: 'maxRetriesExceeded',
      errors: [wrapped, wrapped, wrapped],
    });
    expect(isRetryableError(retryError, 200)).toBe(true);
  });

  it('returns false when RetryError wraps a non-APICallError and the status is not retryable', () => {
    const retryError = new RetryError({
      message: 'Failed after 3 attempts with non-retryable error: boom',
      reason: 'errorNotRetryable',
      errors: [new Error('boom'), new Error('boom')],
    });
    expect(isRetryableError(retryError, 400)).toBe(false);
  });
});

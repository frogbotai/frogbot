import { APICallError, RetryError } from 'ai';
import { describe, expect, it } from 'vitest';

import { isOverflowError } from '../../../../../packages/frogbot/src/chat/compaction/overflow.js';

function providerError({
  statusCode,
  message = 'Bad request.',
  responseBody,
}: {
  statusCode: number;
  message?: string;
  responseBody?: unknown;
}) {
  return new APICallError({
    message,
    url: 'https://api.openai.com/v1/chat/completions',
    requestBodyValues: {},
    statusCode,
    ...(responseBody === undefined ? {} : { responseBody: JSON.stringify(responseBody) }),
    isRetryable: false,
  });
}

describe('isOverflowError', () => {
  it('reads a 413 as an overflow', () => {
    expect(isOverflowError(providerError({ statusCode: 413 }))).toBe(true);
  });

  it('reads an overflow code in the body', () => {
    const error = providerError({
      statusCode: 400,
      responseBody: { error: { code: 'context_length_exceeded', message: 'Too much.' } },
    });

    expect(isOverflowError(error)).toBe(true);
  });

  it('reads an overflow message', () => {
    const error = providerError({ statusCode: 400, message: 'prompt is too long: 210000 tokens' });

    expect(isOverflowError(error)).toBe(true);
  });

  it('unwraps a retry error', () => {
    const error = new RetryError({
      message: 'Failed after 2 attempts.',
      reason: 'maxRetriesExceeded',
      errors: [providerError({ statusCode: 500 }), providerError({ statusCode: 413 })],
    });

    expect(isOverflowError(error)).toBe(true);
  });

  it('leaves other errors alone', () => {
    expect(isOverflowError(providerError({ statusCode: 400 }))).toBe(false);
    expect(isOverflowError(new Error('prompt is too long'))).toBe(false);
  });
});

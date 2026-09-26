import { APICallError } from '@ai-sdk/provider';
import { RetryError } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  extractAnthropicStreamErrorInfo,
  extractOpenAIStreamErrorInfo,
} from '../../../../packages/gateway/src/shared/extractStreamErrorInfo.js';

const apiCallError = (overrides: Partial<ConstructorParameters<typeof APICallError>[0]> = {}) =>
  new APICallError({
    message: 'upstream failed',
    url: 'https://api.example.test/v1/x',
    requestBodyValues: {},
    ...overrides,
  });

describe('extractStreamErrorInfo', () => {
  it('maps a non-error upstream status to 502', () => {
    const err = apiCallError({ statusCode: 200, message: 'Invalid JSON response' });

    const openai = extractOpenAIStreamErrorInfo(err, { production: false });
    const anthropic = extractAnthropicStreamErrorInfo(err, { production: false });

    expect(openai).toEqual({ message: 'Invalid JSON response', type: 'server_error', code: '502' });
    expect(anthropic).toEqual({ message: 'Invalid JSON response', type: 'api_error', code: '502' });
  });

  it('unwraps a RetryError to the last attempt status', () => {
    const wrapped = apiCallError({ statusCode: 429, message: 'Rate limit exceeded' });
    const err = new RetryError({
      message: 'Failed after 3 attempts. Last error: Rate limit exceeded',
      reason: 'maxRetriesExceeded',
      errors: [wrapped, wrapped, wrapped],
    });

    const openai = extractOpenAIStreamErrorInfo(err, { production: false });
    const anthropic = extractAnthropicStreamErrorInfo(err, { production: false });

    expect(openai).toEqual({
      message: 'Rate limit exceeded',
      type: 'rate_limit_error',
      code: '429',
    });
    expect(anthropic).toEqual({
      message: 'Rate limit exceeded',
      type: 'rate_limit_error',
      code: '429',
    });
  });
});

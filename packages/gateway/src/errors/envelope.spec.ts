import {
  APICallError,
  InvalidPromptError,
  JSONParseError,
  LoadAPIKeyError,
  NoSuchModelError,
  TooManyEmbeddingValuesForCallError,
  TypeValidationError,
} from '@ai-sdk/provider';
import { RetryError } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  ConfigError,
  ModelIdError,
  ProviderNotConfiguredError,
  UnsupportedModalityError,
} from './gatewayError.js';
import { toAnthropicErrorResponse, toOpenAIErrorResponse } from './envelope.js';

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
// 1. GatewayError taxonomy
// ---------------------------------------------------------------------------

describe('toOpenAIErrorResponse — GatewayError taxonomy', () => {
  it('maps ModelIdError to 400 invalid_request_error with param=model', () => {
    const { body, status } = toOpenAIErrorResponse(new ModelIdError('gpt-4o-mini'));
    expect(status).toBe(400);
    expect(body.error.type).toBe('invalid_request_error');
    expect(body.error.code).toBe('invalid_model_id');
    expect(body.error.param).toBe('model');
    expect(body.error.message).toMatch(/Invalid model id/);
  });

  it('maps ProviderNotConfiguredError to 404 not_found_error with param=model', () => {
    const { body, status } = toOpenAIErrorResponse(new ProviderNotConfiguredError('anthropic'));
    expect(status).toBe(404);
    expect(body.error.type).toBe('not_found_error');
    expect(body.error.code).toBe('provider_not_configured');
    expect(body.error.param).toBe('model');
  });

  it('maps UnsupportedModalityError to 400 invalid_request_error', () => {
    const { body, status } = toOpenAIErrorResponse(
      new UnsupportedModalityError({ provider: 'openai', modality: 'video' }),
    );
    expect(status).toBe(400);
    expect(body.error.type).toBe('invalid_request_error');
    expect(body.error.code).toBe('unsupported_modality');
  });

  it('maps ConfigError to 500 server_error', () => {
    const { body, status } = toOpenAIErrorResponse(new ConfigError(['missing OPENAI_API_KEY']));
    expect(status).toBe(500);
    expect(body.error.type).toBe('server_error');
    expect(body.error.code).toBe('config_invalid');
  });
});

// ---------------------------------------------------------------------------
// 2. APICallError — status coverage
// ---------------------------------------------------------------------------

describe('toOpenAIErrorResponse — APICallError status coverage', () => {
  it.each([
    [400, 'invalid_request_error', 'bad_request'],
    [401, 'authentication_error', 'invalid_api_key'],
    [403, 'permission_error', 'permission_denied'],
    [404, 'not_found_error', 'not_found'],
    [408, 'invalid_request_error', 'request_timeout'],
    [409, 'invalid_request_error', 'conflict'],
    [422, 'invalid_request_error', 'unprocessable_entity'],
    [429, 'rate_limit_error', 'rate_limit_exceeded'],
    [500, 'server_error', null],
    [502, 'server_error', 'bad_gateway'],
    [503, 'server_error', 'service_unavailable'],
    [504, 'server_error', 'gateway_timeout'],
  ])('status %d → type=%s code=%s', (statusCode, expectedType, expectedCode) => {
    const { body, status } = toOpenAIErrorResponse(apiCallError({ statusCode }));
    expect(status).toBe(statusCode);
    expect(body.error.type).toBe(expectedType);
    expect(body.error.code).toBe(expectedCode);
  });

  it('defaults to 500 server_error when statusCode is missing', () => {
    const { body, status } = toOpenAIErrorResponse(apiCallError({ statusCode: undefined }));
    expect(status).toBe(500);
    expect(body.error.type).toBe('server_error');
  });
});

// ---------------------------------------------------------------------------
// 3. APICallError — verbatim OpenAI-shaped passthrough
// ---------------------------------------------------------------------------

describe('toOpenAIErrorResponse — OpenAI-shaped upstream bodies', () => {
  it('forwards a full OpenAI envelope verbatim', () => {
    const data = {
      error: {
        message: 'Incorrect API key provided: sk-bad.',
        type: 'invalid_request_error',
        code: 'invalid_api_key',
        param: null,
      },
    };
    const err = apiCallError({ statusCode: 401, data, responseBody: JSON.stringify(data) });
    const { body, status } = toOpenAIErrorResponse(err);
    expect(status).toBe(401);
    expect(body).toEqual({
      error: {
        message: 'Incorrect API key provided: sk-bad.',
        type: 'invalid_request_error',
        code: 'invalid_api_key',
        param: null,
      },
    });
  });

  it('preserves upstream param when present', () => {
    const data = {
      error: { message: 'invalid value for messages', type: 'invalid_request_error', code: null, param: 'messages' },
    };
    const { body } = toOpenAIErrorResponse(apiCallError({ statusCode: 400, data }));
    expect(body.error.param).toBe('messages');
  });

  it('normalizes numeric upstream code to a string (OpenRouter)', () => {
    const data = { error: { message: 'Resource exhausted', code: 429 } };
    const { body, status } = toOpenAIErrorResponse(apiCallError({ statusCode: 429, data }));
    expect(status).toBe(429);
    expect(body.error.code).toBe('429');
    expect(body.error.type).toBe('rate_limit_error');
  });

  it('falls back to status-derived type when upstream type is unrecognized', () => {
    const data = { error: { message: 'oops', type: 'completely_unknown_type' } };
    const { body } = toOpenAIErrorResponse(apiCallError({ statusCode: 500, data }));
    expect(body.error.type).toBe('server_error');
  });

  it('accepts a stringified responseBody when data is not set', () => {
    const responseBody = JSON.stringify({
      error: { message: 'rate limited', type: 'rate_limit_error', code: 'rate_limit_exceeded' },
    });
    const { body, status } = toOpenAIErrorResponse(apiCallError({ statusCode: 429, responseBody }));
    expect(status).toBe(429);
    expect(body.error.message).toBe('rate limited');
    expect(body.error.code).toBe('rate_limit_exceeded');
  });

  it('unwraps double-encoded OpenRouter error.message envelope', () => {
    const inner = JSON.stringify({
      error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).', status: 'RESOURCE_EXHAUSTED' },
    });
    const data = { error: { message: inner, code: 429 } };
    const { body, status } = toOpenAIErrorResponse(apiCallError({ statusCode: 429, data }));
    expect(status).toBe(429);
    expect(body.error.message).toBe('Resource has been exhausted (e.g. check quota).');
    expect(body.error.code).toBe('429');
  });

  it('normalizes image content policy refusals to the canonical OpenAI code', () => {
    const data = { error: { message: 'Request blocked by the safety policy.', code: 'safety_blocked' } };
    const { body, status } = toOpenAIErrorResponse(apiCallError({ statusCode: 400, data }));
    expect(status).toBe(400);
    expect(body.error.type).toBe('invalid_request_error');
    expect(body.error.code).toBe('content_policy_violation');
  });
});

// ---------------------------------------------------------------------------
// 4. APICallError — HTML body from upstream proxy
// ---------------------------------------------------------------------------

describe('toOpenAIErrorResponse — HTML body from upstream proxy/gateway', () => {
  it('substitutes friendly 401 message when body is HTML', () => {
    const html = '<!doctype html><html><body><h1>401 Unauthorized</h1></body></html>';
    const { body, status } = toOpenAIErrorResponse(apiCallError({ statusCode: 401, responseBody: html }));
    expect(status).toBe(401);
    expect(body.error.type).toBe('authentication_error');
    expect(body.error.message).toMatch(/blocked by a gateway or proxy/);
    expect(body.error.message).not.toMatch(/<html/);
  });

  it('substitutes friendly 403 message when body is HTML', () => {
    const html = '<html><body>Forbidden</body></html>';
    const { body, status } = toOpenAIErrorResponse(apiCallError({ statusCode: 403, responseBody: html }));
    expect(status).toBe(403);
    expect(body.error.message).toMatch(/blocked by a gateway or proxy/);
  });

  it('uses a generic friendly message for other statuses with HTML bodies', () => {
    const { body, status } = toOpenAIErrorResponse(
      apiCallError({ statusCode: 502, responseBody: '<html>bad gateway page</html>' }),
    );
    expect(status).toBe(502);
    expect(body.error.message).toMatch(/HTML response/);
  });
});

// ---------------------------------------------------------------------------
// 5. APICallError — empty / malformed bodies
// ---------------------------------------------------------------------------

describe('toOpenAIErrorResponse — empty / malformed bodies', () => {
  it('uses err.message when responseBody is missing', () => {
    const { body } = toOpenAIErrorResponse(apiCallError({ message: 'upstream timed out', statusCode: 504 }));
    expect(body.error.message).toBe('upstream timed out');
  });

  it('falls back to the HTTP reason phrase when message AND body are empty', () => {
    const err = apiCallError({ message: '', statusCode: 502, responseBody: '' });
    const { body } = toOpenAIErrorResponse(err);
    expect(body.error.message).toBe('Bad Gateway');
  });

  it('falls back to the body when message is empty but body is plain text', () => {
    const { body } = toOpenAIErrorResponse(
      apiCallError({ message: '', statusCode: 500, responseBody: 'something exploded' }),
    );
    expect(body.error.message).toBe('something exploded');
  });

  it('handles non-JSON body without throwing', () => {
    const { body, status } = toOpenAIErrorResponse(
      apiCallError({ statusCode: 502, responseBody: 'not json at all' }),
    );
    expect(status).toBe(502);
    expect(body.error.type).toBe('server_error');
  });
});

// ---------------------------------------------------------------------------
// 6. Context overflow normalization
// ---------------------------------------------------------------------------

describe('toOpenAIErrorResponse — context overflow normalization', () => {
  it('normalizes OpenAI context_length_exceeded body to canonical envelope', () => {
    const data = {
      error: {
        message: "This model's maximum context length is 8192 tokens. Your request used 10000.",
        type: 'invalid_request_error',
        code: 'context_length_exceeded',
        param: null,
      },
    };
    const { body, status } = toOpenAIErrorResponse(apiCallError({ statusCode: 400, data }));
    expect(status).toBe(400);
    expect(body.error.code).toBe('context_length_exceeded');
    expect(body.error.type).toBe('invalid_request_error');
    expect(body.error.param).toBe('messages');
  });

  it('normalizes Anthropic "prompt is too long" message', () => {
    const { body, status } = toOpenAIErrorResponse(
      apiCallError({ statusCode: 400, message: 'prompt is too long: 250000 tokens > 200000 maximum' }),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe('context_length_exceeded');
    expect(body.error.message).toMatch(/prompt is too long/);
  });

  it('normalizes 413 Request Entity Too Large to context overflow', () => {
    const { body, status } = toOpenAIErrorResponse(
      apiCallError({ statusCode: 413, message: 'Payload Too Large' }),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe('context_length_exceeded');
  });

  it('normalizes Gemini "input token count exceeds the maximum"', () => {
    const { body } = toOpenAIErrorResponse(
      apiCallError({ statusCode: 400, message: 'input token count of 50000 exceeds the maximum of 32000' }),
    );
    expect(body.error.code).toBe('context_length_exceeded');
  });

  it('normalizes Mistral empty-body 413', () => {
    const { body, status } = toOpenAIErrorResponse(
      apiCallError({ statusCode: 413, message: '413 (no body)' }),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe('context_length_exceeded');
  });
});

// ---------------------------------------------------------------------------
// 7. AI SDK subclasses
// ---------------------------------------------------------------------------

describe('toOpenAIErrorResponse — AI SDK error subclasses', () => {
  it('maps NoSuchModelError to 404 model_not_found', () => {
    const err = new NoSuchModelError({ modelId: 'gpt-99', modelType: 'languageModel' });
    const { body, status } = toOpenAIErrorResponse(err);
    expect(status).toBe(404);
    expect(body.error.code).toBe('model_not_found');
    expect(body.error.param).toBe('model');
  });

  it('maps InvalidPromptError to 400 invalid_prompt', () => {
    const err = new InvalidPromptError({ prompt: {}, message: 'no messages' });
    const { body, status } = toOpenAIErrorResponse(err);
    expect(status).toBe(400);
    expect(body.error.code).toBe('invalid_prompt');
    expect(body.error.type).toBe('invalid_request_error');
  });

  it('maps TooManyEmbeddingValuesForCallError to 400 invalid request', () => {
    const err = new TooManyEmbeddingValuesForCallError({
      provider: 'openai',
      modelId: 'text-embedding-3-small',
      maxEmbeddingsPerCall: 2,
      values: ['a', 'b', 'c'],
    });
    const { body, status } = toOpenAIErrorResponse(err);
    expect(status).toBe(400);
    expect(body.error.type).toBe('invalid_request_error');
    expect(body.error.code).toBe('too_many_embedding_values');
    expect(body.error.param).toBe('input');
  });

  it('maps LoadAPIKeyError to 500 missing_api_key', () => {
    const err = new LoadAPIKeyError({ message: 'OPENAI_API_KEY is not set' });
    const { body, status } = toOpenAIErrorResponse(err);
    expect(status).toBe(500);
    expect(body.error.code).toBe('missing_api_key');
    expect(body.error.type).toBe('server_error');
  });

  it('maps JSONParseError to 502 upstream_invalid_response', () => {
    const err = new JSONParseError({ text: '{not json', cause: new Error('parse fail') });
    const { body, status } = toOpenAIErrorResponse(err);
    expect(status).toBe(502);
    expect(body.error.code).toBe('upstream_invalid_response');
    expect(body.error.message).toMatch(/could not parse/);
  });

  it('maps TypeValidationError to 502 upstream_invalid_response', () => {
    const err = new TypeValidationError({ value: { wrong: true }, cause: new Error('bad shape') });
    const { body, status } = toOpenAIErrorResponse(err);
    expect(status).toBe(502);
    expect(body.error.code).toBe('upstream_invalid_response');
  });
});

// ---------------------------------------------------------------------------
// 8. Unknown / non-Error throws
// ---------------------------------------------------------------------------

describe('toOpenAIErrorResponse — unknown throws', () => {
  it('handles plain Error', () => {
    const { body, status } = toOpenAIErrorResponse(new Error('boom'));
    expect(status).toBe(500);
    expect(body.error.message).toBe('boom');
    expect(body.error.type).toBe('server_error');
  });

  it('handles string throws', () => {
    const { body, status } = toOpenAIErrorResponse('oops');
    expect(status).toBe(500);
    expect(body.error.message).toBe('Internal server error');
  });

  it('handles number throws', () => {
    const { body, status } = toOpenAIErrorResponse(42);
    expect(status).toBe(500);
    expect(body.error.message).toBe('Internal server error');
  });

  it('handles undefined / null throws', () => {
    expect(toOpenAIErrorResponse(undefined).status).toBe(500);
    expect(toOpenAIErrorResponse(null).status).toBe(500);
  });

  it('handles Error with empty message', () => {
    const { body } = toOpenAIErrorResponse(new Error(''));
    expect(body.error.message).toBe('Internal server error');
  });
});

// ---------------------------------------------------------------------------
// 9. RetryError unwrapping (G4 / HE1)
// ---------------------------------------------------------------------------
//
// `generateText`/`streamText` throw `RetryError` (from `ai`) once their
// internal retries are exhausted on a retryable upstream failure. The
// envelope translators must unwrap `err.lastError` rather than falling into
// the generic `AISDKError` catch-all.

describe('toOpenAIErrorResponse — RetryError unwrapping', () => {
  it('unwraps a RetryError wrapping a 429 APICallError to 429 rate_limit_error with the wrapped message', () => {
    const wrapped = apiCallError({
      statusCode: 429,
      message: 'Rate limit exceeded',
      responseHeaders: { 'retry-after': '30' },
      responseBody: JSON.stringify({ error: { message: 'Rate limit exceeded' } }),
    });
    const retryError = new RetryError({
      message: 'Failed after 3 attempts. Last error: Rate limit exceeded',
      reason: 'maxRetriesExceeded',
      errors: [wrapped, wrapped, wrapped],
    });
    const { body, status } = toOpenAIErrorResponse(retryError);
    expect(status).toBe(429);
    expect(body.error.type).toBe('rate_limit_error');
    expect(body.error.message).toBe('Rate limit exceeded');
  });

  it('unwraps a RetryError wrapping a 500 APICallError to 500 server_error', () => {
    const wrapped = apiCallError({ statusCode: 500, message: 'Internal upstream failure' });
    const retryError = new RetryError({
      message: 'Failed after 3 attempts. Last error: Internal upstream failure',
      reason: 'maxRetriesExceeded',
      errors: [wrapped, wrapped, wrapped],
    });
    const { body, status } = toOpenAIErrorResponse(retryError);
    expect(status).toBe(500);
    expect(body.error.type).toBe('server_error');
  });

  it('falls back to 502 server_error when the RetryError does not wrap an APICallError', () => {
    const retryError = new RetryError({
      message: 'Failed after 3 attempts with non-retryable error: boom',
      reason: 'errorNotRetryable',
      errors: [new Error('boom'), new Error('boom')],
    });
    const { body, status } = toOpenAIErrorResponse(retryError);
    expect(status).toBe(502);
    expect(body.error.type).toBe('server_error');
    expect(body.error.message).toBe(retryError.message);
  });
});

describe('toAnthropicErrorResponse — RetryError unwrapping', () => {
  it('unwraps a RetryError wrapping a 429 APICallError to 429 rate_limit_error with the wrapped message', () => {
    const wrapped = apiCallError({
      statusCode: 429,
      message: 'Rate limit exceeded',
      responseHeaders: { 'retry-after': '30' },
      responseBody: JSON.stringify({ error: { message: 'Rate limit exceeded' } }),
    });
    const retryError = new RetryError({
      message: 'Failed after 3 attempts. Last error: Rate limit exceeded',
      reason: 'maxRetriesExceeded',
      errors: [wrapped, wrapped, wrapped],
    });
    const { body, status } = toAnthropicErrorResponse(retryError);
    expect(status).toBe(429);
    expect(body.error.type).toBe('rate_limit_error');
    expect(body.error.message).toBe('Rate limit exceeded');
  });

  it('unwraps a RetryError wrapping a 500 APICallError to 500 api_error', () => {
    const wrapped = apiCallError({ statusCode: 500, message: 'Internal upstream failure' });
    const retryError = new RetryError({
      message: 'Failed after 3 attempts. Last error: Internal upstream failure',
      reason: 'maxRetriesExceeded',
      errors: [wrapped, wrapped, wrapped],
    });
    const { body, status } = toAnthropicErrorResponse(retryError);
    expect(status).toBe(500);
    expect(body.error.type).toBe('api_error');
  });

  it('falls back to 502 api_error when the RetryError does not wrap an APICallError', () => {
    const retryError = new RetryError({
      message: 'Failed after 3 attempts with non-retryable error: boom',
      reason: 'errorNotRetryable',
      errors: [new Error('boom'), new Error('boom')],
    });
    const { body, status } = toAnthropicErrorResponse(retryError);
    expect(status).toBe(502);
    expect(body.error.type).toBe('api_error');
    expect(body.error.message).toBe(retryError.message);
  });
});

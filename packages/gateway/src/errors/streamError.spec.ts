import { describe, expect, it } from 'vitest';

import {
  inferStatusFromStreamError,
  parseStreamErrorFrame,
  streamErrorFrameToEnvelope,
} from './streamError.js';

// ---------------------------------------------------------------------------
// parseStreamErrorFrame
// ---------------------------------------------------------------------------

describe('parseStreamErrorFrame', () => {
  it('parses an OpenAI Chat-style early error frame', () => {
    const frame = {
      type: 'error',
      error: {
        code: 'rate_limit_exceeded',
        message: 'Rate limit reached',
        type: 'rate_limit_error',
        param: null,
      },
    };
    expect(parseStreamErrorFrame(frame)).toEqual({
      message: 'Rate limit reached',
      code: 'rate_limit_exceeded',
      type: 'rate_limit_error',
      frame,
    });
  });

  it('parses a Responses-style response.failed frame', () => {
    const frame = {
      type: 'response.failed',
      response: { error: { code: 'server_error', message: 'response failed' } },
    };
    expect(parseStreamErrorFrame(frame)).toEqual({
      message: 'response failed',
      code: 'server_error',
      type: 'response.failed',
      frame,
    });
  });

  it('tolerates a missing top-level "type" field when error object is present', () => {
    const frame = { error: { code: 'server_error', message: 'down' } };
    const result = parseStreamErrorFrame(frame);
    expect(result?.message).toBe('down');
    expect(result?.code).toBe('server_error');
  });

  it('parses a stringified SSE data payload', () => {
    const json = JSON.stringify({ type: 'error', error: { code: 'server_error', message: 'boom', type: 'server_error' } });
    expect(parseStreamErrorFrame(json)?.message).toBe('boom');
  });

  it('preserves numeric upstream codes', () => {
    const frame = { type: 'error', error: { code: 429, message: 'rate limited' } };
    expect(parseStreamErrorFrame(frame)?.code).toBe(429);
  });

  it('returns undefined for non-error frames', () => {
    expect(parseStreamErrorFrame({ type: 'message', content: 'hello' })).toBeUndefined();
    expect(parseStreamErrorFrame({})).toBeUndefined();
    expect(parseStreamErrorFrame(null)).toBeUndefined();
    expect(parseStreamErrorFrame('not json at all')).toBeUndefined();
  });

  it('returns undefined for response.failed without error.message', () => {
    expect(parseStreamErrorFrame({ type: 'response.failed', response: {} })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// inferStatusFromStreamError
// ---------------------------------------------------------------------------

describe('inferStatusFromStreamError', () => {
  it.each([
    ['numeric 429 code', { message: 'x', code: 429, type: null, frame: null }, 429],
    ['numeric 503 code', { message: 'x', code: 503, type: null, frame: null }, 503],
    ['three-digit string code', { message: 'x', code: '404', type: null, frame: null }, 404],
    ['rate_limit_exceeded keyword', { message: 'x', code: 'rate_limit_exceeded', type: null, frame: null }, 429],
    ['insufficient_quota keyword', { message: 'x', code: 'insufficient_quota', type: null, frame: null }, 429],
    ['too_many_requests', { message: 'x', code: 'too_many_requests', type: null, frame: null }, 429],
    ['invalid_api_key keyword', { message: 'x', code: 'invalid_api_key', type: null, frame: null }, 401],
    ['authentication type', { message: 'x', code: null, type: 'authentication_error', frame: null }, 401],
    ['permission keyword', { message: 'x', code: 'permission_denied', type: null, frame: null }, 403],
    ['not_found keyword', { message: 'x', code: 'model_not_found', type: null, frame: null }, 404],
    ['context_length keyword', { message: 'x', code: 'context_length_exceeded', type: null, frame: null }, 400],
    ['overload keyword', { message: 'x', code: 'server_is_overloaded', type: null, frame: null }, 503],
    ['timeout keyword', { message: 'x', code: 'gateway_timeout', type: null, frame: null }, 504],
    ['unknown → 500', { message: 'x', code: 'mystery', type: null, frame: null }, 500],
    ['nothing → 500', { message: 'x', code: null, type: null, frame: null }, 500],
  ])('%s', (_, parsed, expected) => {
    expect(inferStatusFromStreamError(parsed as Parameters<typeof inferStatusFromStreamError>[0])).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// streamErrorFrameToEnvelope
// ---------------------------------------------------------------------------

describe('streamErrorFrameToEnvelope', () => {
  it('produces a complete OpenAI envelope for a rate-limit frame', () => {
    const result = streamErrorFrameToEnvelope({
      type: 'error',
      error: { code: 'rate_limit_exceeded', message: 'Rate limit reached', type: 'rate_limit_error', param: null },
    });
    expect(result).toEqual({
      status: 429,
      body: {
        error: {
          message: 'Rate limit reached',
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded',
          param: null,
        },
      },
    });
  });

  it('produces a server_error envelope for response.failed', () => {
    const result = streamErrorFrameToEnvelope({
      type: 'response.failed',
      response: { error: { code: 'server_error', message: 'response failed' } },
    });
    expect(result?.status).toBe(500);
    expect(result?.body.error.type).toBe('server_error');
    expect(result?.body.error.code).toBe('server_error');
  });

  it('coerces numeric codes to strings in the envelope', () => {
    const result = streamErrorFrameToEnvelope({ type: 'error', error: { code: 429, message: 'rate limited' } });
    expect(result?.body.error.code).toBe('429');
    expect(result?.status).toBe(429);
  });

  it('returns undefined for non-error frames', () => {
    expect(streamErrorFrameToEnvelope({ type: 'message.delta', delta: 'hi' })).toBeUndefined();
  });
});

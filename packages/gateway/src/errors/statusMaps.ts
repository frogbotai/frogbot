// Status ↔ error-type maps — the single source of truth (G88 / HE13).
//
// Every status→type decision in the gateway routes through these functions:
// the JSON envelope builders (`envelope.ts`), the stream-error frame parser
// (`streamError.ts`), and the mid-stream extractors
// (`shared/extractStreamErrorInfo.ts`). Do NOT re-implement these branches
// elsewhere — drift between copies is exactly the bug this file exists to
// prevent.

import type { AnthropicErrorType, GatewayHttpStatus, OpenAIErrorType } from './envelope.js';

/** Map an HTTP status to OpenAI's documented `error.type` values. */
export function statusToOpenAIType(status: number): OpenAIErrorType {
  if (status === 401) return 'authentication_error';
  if (status === 403) return 'permission_error';
  if (status === 404) return 'not_found_error';
  if (status === 429) return 'rate_limit_error';
  if (status >= 500) return 'server_error';
  return 'invalid_request_error';
}

// Per platform.claude.com/docs/en/api/errors: 402 billing_error,
// 413 request_too_large, 504 timeout_error, 529 overloaded_error (reserved
// for 529 only — a 502/503 is api_error, not "overloaded").
/** Map an HTTP status to Anthropic's documented `error.type` values. */
export function statusToAnthropicType(status: number): AnthropicErrorType {
  switch (status) {
    case 400:
      return 'invalid_request_error';
    case 401:
      return 'authentication_error';
    case 402:
      return 'billing_error';
    case 403:
      return 'permission_error';
    case 404:
      return 'not_found_error';
    case 413:
      return 'request_too_large';
    case 429:
      return 'rate_limit_error';
    case 504:
      return 'timeout_error';
    case 529:
      return 'overloaded_error';
    default:
      return status >= 500 ? 'api_error' : 'invalid_request_error';
  }
}

/** Inverse of {@link statusToAnthropicType}: recover the HTTP status from a wire error type. */
export function statusForAnthropicErrorType(type: string | undefined): GatewayHttpStatus {
  switch (type) {
    case 'invalid_request_error':
      return 400;
    case 'authentication_error':
      return 401;
    case 'billing_error':
      return 402;
    case 'permission_error':
      return 403;
    case 'not_found_error':
      return 404;
    case 'request_too_large':
      return 413;
    case 'rate_limit_error':
      return 429;
    case 'timeout_error':
      return 504;
    case 'overloaded_error':
      return 529;
    default:
      return 500;
  }
}

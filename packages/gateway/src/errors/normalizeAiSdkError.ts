// AI SDK error → gateway headers extraction.
//
// The existing `toOpenAIErrorResponse` / `toAnthropicErrorResponse` map
// error → { body, status }. This module adds the header dimension:
// pulling `retry-after` / `retry-after-ms` from an upstream `APICallError`
// so the gateway can propagate retry hints to the client.
//
// Also exports `isRetryableError` for downstream consumers that want to
// classify without unwrapping the envelope.
//
// Both functions unwrap `RetryError` first (via `unwrapRetryError`) so a
// retry-exhausted upstream failure — the real `APICallError` is buried in
// `err.lastError` — is classified and forwards its headers the same as an
// unwrapped `APICallError` would.

import { APICallError } from '@ai-sdk/provider';

import { buildRetryHeaders, isRetryableStatus } from './retryHeaders.js';
import { filterResponseHeaders } from './filterResponseHeaders.js';
import { unwrapRetryError } from './unwrapRetryError.js';

/**
 * Given any thrown value, return the filtered outbound headers to attach
 * to the error response. Includes retry-after variants for retryable
 * upstream statuses.
 */
export function headersForError(err: unknown, status: number): Record<string, string> {
  let upstreamHeaders: Headers | Record<string, string> | undefined;

  const cause = unwrapRetryError(err);
  if (APICallError.isInstance(cause)) {
    upstreamHeaders = cause.responseHeaders;
  }

  const filtered = filterResponseHeaders(upstreamHeaders);
  const retry = buildRetryHeaders({ status, upstreamHeaders });
  return { ...filtered, ...retry };
}

export function isRetryableError(err: unknown, status: number): boolean {
  if (isRetryableStatus(status)) return true;
  const cause = unwrapRetryError(err);
  if (APICallError.isInstance(cause) && typeof cause.statusCode === 'number') {
    return isRetryableStatus(cause.statusCode);
  }
  return false;
}

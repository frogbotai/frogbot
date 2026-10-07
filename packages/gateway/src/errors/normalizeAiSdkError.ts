import { GatewayError as AIGatewayError } from '@ai-sdk/gateway';
import { APICallError } from '@ai-sdk/provider';

import { filterResponseHeaders } from './filterResponseHeaders.js';
import { buildRetryHeaders, isRetryableStatus } from './retryHeaders.js';
import { unwrapRetryError } from './unwrapRetryError.js';

/**
 * Given any thrown value, return the filtered outbound headers to attach
 * to the error response. Includes retry-after variants for retryable
 * upstream statuses.
 */
export function headersForError(err: unknown, status: number): Record<string, string> {
  let upstreamHeaders: Headers | Record<string, string> | undefined;

  if (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { retryAfterSeconds?: unknown }).retryAfterSeconds === 'number'
  ) {
    upstreamHeaders = {
      'retry-after': String((err as { retryAfterSeconds: number }).retryAfterSeconds),
    };
  }

  const cause = unwrapRetryError(err);
  const upstream = AIGatewayError.isInstance(cause) ? cause.cause : cause;

  if (APICallError.isInstance(upstream)) {
    upstreamHeaders = upstream.responseHeaders;
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

  if (AIGatewayError.isInstance(cause)) {
    return isRetryableStatus(cause.statusCode);
  }

  return false;
}

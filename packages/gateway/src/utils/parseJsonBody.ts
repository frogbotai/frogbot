import type { Context } from 'hono';

import { BodyTooLargeError, RequestValidationError, isGatewayError } from '../errors/gatewayError.js';
import { withStreamBodyLimit } from './streamBodyLimit.js';

/** Default request-body cap for JSON routes (10 MB). */
export const DEFAULT_MAX_JSON_BODY_BYTES = 10 * 1024 * 1024;

/**
 * Safely parse the JSON body from a Hono context.
 *
 * Enforces `maxBodyBytes` (default 10 MB) before buffering: a Content-Length
 * header over the cap is rejected up front with a 413 `BodyTooLargeError`,
 * and bodies without a Content-Length (chunked) are read through a
 * size-limited stream that errors once the cap is crossed.
 *
 * Malformed JSON produces a clean 400 `RequestValidationError` instead of
 * letting a raw SyntaxError propagate as a 500.
 */
export async function parseJsonBody(c: Context, maxBodyBytes?: number): Promise<unknown> {
  const limit = maxBodyBytes ?? DEFAULT_MAX_JSON_BODY_BYTES;
  const contentLengthHeader = c.req.header('content-length');
  const contentLength = contentLengthHeader == null ? undefined : Number(contentLengthHeader);
  const hasValidContentLength =
    contentLength != null && Number.isFinite(contentLength) && contentLength >= 0;

  if (hasValidContentLength && contentLength > limit) {
    throw new BodyTooLargeError({
      message: `Request body exceeds ${limit} bytes`,
      param: 'content-length',
    });
  }

  const request = hasValidContentLength ? c.req.raw : withStreamBodyLimit(c.req.raw, limit);

  try {
    return await request.json();
  } catch (e) {
    if (isGatewayError(e)) {
      throw e;
    }
    const message =
      e instanceof SyntaxError
        ? `Request body is not valid JSON: ${e.message}`
        : 'Request body is not valid JSON';
    throw new RequestValidationError({ message, param: '(body)' });
  }
}

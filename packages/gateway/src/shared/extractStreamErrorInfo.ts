// Mid-stream error-part extraction for the SSE stream transforms.
//
// These run AFTER the HTTP 200 has been committed, so the error text lands in
// an in-band SSE error frame. That frame is still a client-facing error
// surface: 5xx messages must be masked in production (G35 / HE4) and
// operator-credential fragments stripped unconditionally (G34), exactly like
// the JSON envelope path in `errors/envelope.ts`.

import { maybeMaskMessage, redactKeyFragments } from '../errors/maskMessage.js';
import {
  isUpstreamSuccessStatus,
  statusToAnthropicType,
  statusToOpenAIType,
} from '../errors/statusMaps.js';
import { unwrapRetryError } from '../errors/unwrapRetryError.js';
import { isProduction } from './runtimeDetection.js';

export type StreamErrorInfo = {
  message: string;
  type: string;
  code: string | null;
};

export type StreamErrorMaskOptions = {
  requestId?: string | undefined;
  production?: boolean | undefined;
};

/**
 * Apply the gateway's masking contract to an upstream-derived mid-stream
 * error message. Errors without a status are server faults (500-class), so
 * they mask in production too.
 */
function maskStreamErrorMessage(
  message: string,
  status: number | undefined,
  opts: StreamErrorMaskOptions,
): string {
  return maybeMaskMessage(redactKeyFragments(message), {
    status: status ?? 500,
    requestId: opts.requestId,
    production: opts.production ?? isProduction(),
  });
}

function errorStatusCode(error: Error): number | undefined {
  const { statusCode } = error as { statusCode?: unknown };

  if (typeof statusCode !== 'number') return undefined;

  return isUpstreamSuccessStatus(statusCode) ? 502 : statusCode;
}

export function extractOpenAIStreamErrorInfo(
  error: unknown,
  opts: StreamErrorMaskOptions = {},
): StreamErrorInfo {
  const cause = unwrapRetryError(error);

  if (cause instanceof Error) {
    const statusCode = errorStatusCode(cause);

    return {
      message: maskStreamErrorMessage(
        cause.message || 'An error occurred during streaming',
        statusCode,
        opts,
      ),
      type: statusCode !== undefined ? statusToOpenAIType(statusCode) : 'server_error',
      code: statusCode !== undefined ? String(statusCode) : null,
    };
  }

  if (typeof cause === 'string') {
    return {
      message: maskStreamErrorMessage(cause, undefined, opts),
      type: 'server_error',
      code: null,
    };
  }

  if (typeof cause === 'object' && cause !== null) {
    const obj = cause as Record<string, unknown>;
    return {
      message: maskStreamErrorMessage(
        typeof obj.message === 'string' ? obj.message : 'An error occurred during streaming',
        undefined,
        opts,
      ),
      type: 'server_error',
      code: typeof obj.code === 'string' ? obj.code : null,
    };
  }

  return { message: 'An error occurred during streaming', type: 'server_error', code: null };
}

export function extractAnthropicStreamErrorInfo(
  error: unknown,
  opts: StreamErrorMaskOptions = {},
): StreamErrorInfo {
  const cause = unwrapRetryError(error);

  if (cause instanceof Error) {
    const statusCode = errorStatusCode(cause);

    return {
      message: maskStreamErrorMessage(
        cause.message || 'An error occurred during streaming',
        statusCode,
        opts,
      ),
      type: statusCode ? statusToAnthropicType(statusCode) : 'api_error',
      code: statusCode !== undefined ? String(statusCode) : null,
    };
  }

  if (typeof cause === 'string') {
    return {
      message: maskStreamErrorMessage(cause, undefined, opts),
      type: 'api_error',
      code: null,
    };
  }

  if (typeof cause === 'object' && cause !== null) {
    const obj = cause as Record<string, unknown>;
    return {
      message: maskStreamErrorMessage(
        typeof obj.message === 'string' ? obj.message : 'An error occurred during streaming',
        undefined,
        opts,
      ),
      type: 'api_error',
      code: typeof obj.code === 'string' ? obj.code : null,
    };
  }

  return { message: 'An error occurred during streaming', type: 'api_error', code: null };
}

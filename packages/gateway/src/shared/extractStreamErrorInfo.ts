// Mid-stream error-part extraction for the SSE stream transforms.
//
// These run AFTER the HTTP 200 has been committed, so the error text lands in
// an in-band SSE error frame. That frame is still a client-facing error
// surface: 5xx messages must be masked in production (G35 / HE4) and
// operator-credential fragments stripped unconditionally (G34), exactly like
// the JSON envelope path in `errors/envelope.ts`.

import { maybeMaskMessage, redactKeyFragments } from '../errors/maskMessage.js';
import { statusToAnthropicType, statusToOpenAIType } from '../errors/statusMaps.js';
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
function maskStreamErrorMessage(message: string, status: number | undefined, opts: StreamErrorMaskOptions): string {
  return maybeMaskMessage(redactKeyFragments(message), {
    status: status ?? 500,
    requestId: opts.requestId,
    production: opts.production ?? isProduction(),
  });
}

export function extractOpenAIStreamErrorInfo(error: unknown, opts: StreamErrorMaskOptions = {}): StreamErrorInfo {
  if (error instanceof Error) {
    const apiErr = error as { statusCode?: number; message: string };
    return {
      message: maskStreamErrorMessage(apiErr.message || 'An error occurred during streaming', apiErr.statusCode, opts),
      type: typeof apiErr.statusCode === 'number' ? statusToOpenAIType(apiErr.statusCode) : 'server_error',
      code: typeof apiErr.statusCode === 'number' ? String(apiErr.statusCode) : null,
    };
  }
  if (typeof error === 'string') {
    return { message: maskStreamErrorMessage(error, undefined, opts), type: 'server_error', code: null };
  }
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
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

export function extractAnthropicStreamErrorInfo(error: unknown, opts: StreamErrorMaskOptions = {}): StreamErrorInfo {
  if (error instanceof Error) {
    const apiErr = error as { statusCode?: number; message: string };
    return {
      message: maskStreamErrorMessage(apiErr.message || 'An error occurred during streaming', apiErr.statusCode, opts),
      type: apiErr.statusCode ? statusToAnthropicType(apiErr.statusCode) : 'api_error',
      code: typeof apiErr.statusCode === 'number' ? String(apiErr.statusCode) : null,
    };
  }
  if (typeof error === 'string') {
    return { message: maskStreamErrorMessage(error, undefined, opts), type: 'api_error', code: null };
  }
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
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

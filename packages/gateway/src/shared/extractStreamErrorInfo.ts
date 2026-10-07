import { isGatewayError } from '../errors/gatewayError.js';
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
  if (isGatewayError(error)) return error.status;

  const { statusCode } = error as { statusCode?: unknown };

  if (typeof statusCode !== 'number') return undefined;

  return isUpstreamSuccessStatus(statusCode) ? 502 : statusCode;
}

function errorCode(error: Error, statusCode: number | undefined): string | null {
  if (isGatewayError(error)) return error.code;

  return statusCode !== undefined ? String(statusCode) : null;
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
      code: errorCode(cause, statusCode),
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
      code: errorCode(cause, statusCode),
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

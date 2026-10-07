import { GatewayError as AIGatewayError, GatewayModelNotFoundError } from '@ai-sdk/gateway';
import {
  AISDKError,
  APICallError,
  InvalidPromptError,
  JSONParseError,
  LoadAPIKeyError,
  NoSuchModelError,
  TooManyEmbeddingValuesForCallError,
  TypeValidationError,
} from '@ai-sdk/provider';
import { RetryError } from 'ai';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { isProduction } from '../shared/runtimeDetection.js';
import { classifyAiSdkError } from './classifyAiSdkError.js';
import { isUpstreamAbortError } from './clientAbort.js';
import { type GatewayErrorCode, isGatewayError } from './gatewayError.js';
import { maybeMaskMessage, redactKeyFragments } from './maskMessage.js';
import { CONTEXT_OVERFLOW_ENVELOPE, isContextOverflow } from './overflow.js';
import {
  isUpstreamSuccessStatus,
  statusToAnthropicType,
  statusToOpenAIType,
} from './statusMaps.js';
import { unwrapRetryError } from './unwrapRetryError.js';

/** OpenAI's documented `error.type` values. */
export type OpenAIErrorType =
  | 'invalid_request_error'
  | 'authentication_error'
  | 'permission_error'
  | 'not_found_error'
  | 'rate_limit_error'
  | 'server_error'
  | 'api_error';

export type OpenAIErrorEnvelope = {
  error: {
    message: string;
    type: OpenAIErrorType;
    code: string | null;
    param: string | null;
  };
};

export type ErrorResponseOptions = {
  requestId?: string | undefined;
  production?: boolean | undefined;
};

/** HTTP statuses we use; widened so Hono's `c.json(body, status)` accepts them. */
export type GatewayHttpStatus =
  400 | 401 | 402 | 403 | 404 | 408 | 409 | 413 | 422 | 429 | 500 | 502 | 503 | 504 | 529;

export function toContentfulStatus(status: GatewayHttpStatus): ContentfulStatusCode {
  return status as ContentfulStatusCode;
}

const HTTP_STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  408: 'Request Timeout',
  409: 'Conflict',
  413: 'Payload Too Large',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  529: 'Overloaded',
};

/** Standard HTTP reason phrase for a status, for telemetry `error.type` labels. */
export function httpStatusText(status: number): string {
  return HTTP_STATUS_TEXT[status] ?? 'Error';
}

/** Best-effort HTTP status for an arbitrary error, via the OpenAI-shaped translator. */
export function statusForError(err: unknown): GatewayHttpStatus {
  return toOpenAIErrorResponse(err).status;
}

const GATEWAY_CODE_TO_TYPE: Record<GatewayErrorCode, OpenAIErrorType> = {
  budget_exceeded: 'invalid_request_error',
  config_invalid: 'server_error',
  invalid_model_id: 'invalid_request_error',
  model_not_found: 'not_found_error',
  model_not_allowed: 'invalid_request_error',
  model_unsupported_operation: 'invalid_request_error',
  no_providers: 'server_error',
  provider_not_configured: 'not_found_error',
  rate_limit_exceeded: 'rate_limit_error',
  unsupported_modality: 'invalid_request_error',
  invalid_request_body: 'invalid_request_error',
  invalid_tool_arguments: 'invalid_request_error',
  request_entity_too_large: 'invalid_request_error',
  resource_not_found: 'not_found_error',
  structured_output_invalid: 'server_error',
};

function openAICodeForStatus(status: number): string | null {
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'invalid_api_key';
    case 403:
      return 'permission_denied';
    case 404:
      return 'not_found';
    case 408:
      return 'request_timeout';
    case 409:
      return 'conflict';
    case 413:
      return 'request_entity_too_large';
    case 422:
      return 'unprocessable_entity';
    case 429:
      return 'rate_limit_exceeded';
    case 502:
      return 'bad_gateway';
    case 503:
      return 'service_unavailable';
    case 504:
      return 'gateway_timeout';
    default:
      return null;
  }
}

const HTML_BODY_RE = /^\s*<(?:!doctype|html)/i;

function looseJson(input: unknown): Record<string, unknown> | undefined {
  let value: unknown = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch {
      return undefined;
    }
  }

  if (typeof value !== 'object' || value === null) return undefined;

  const obj = value as Record<string, unknown>;

  const err = obj.error;
  if (typeof err === 'object' && err !== null) {
    const innerMessage = (err as { message?: unknown }).message;
    if (typeof innerMessage === 'string') {
      try {
        const reparsed = JSON.parse(innerMessage) as unknown;
        if (typeof reparsed === 'object' && reparsed !== null && 'error' in reparsed) {
          return reparsed;
        }
      } catch {}
    }
  }

  return obj;
}

type LooseOpenAIBody = {
  error: {
    message?: unknown;
    type?: unknown;
    code?: unknown;
    param?: unknown;
  };
};

function asLooseOpenAIBody(obj: Record<string, unknown> | undefined): LooseOpenAIBody | undefined {
  if (!obj) return undefined;
  const err = obj.error;
  if (typeof err !== 'object' || err === null) return undefined;

  return obj as LooseOpenAIBody;
}

function normalizeCode(code: unknown): string | null {
  if (typeof code === 'string') return code;
  if (typeof code === 'number') return String(code);

  return null;
}

function normalizeParam(param: unknown): string | null {
  return typeof param === 'string' ? param : null;
}

function hasContentPolicySignal(args: { status: number; code: unknown; message: string }): boolean {
  if (args.status !== 400) return false;
  if (args.code === 'content_policy_violation') return true;

  return /content[ _-]?policy|safety system|safety policy/i.test(args.message);
}

function normalizeType(type: unknown, fallback: OpenAIErrorType): OpenAIErrorType {
  if (typeof type !== 'string') return fallback;
  switch (type) {
    case 'invalid_request_error':
    case 'authentication_error':
    case 'permission_error':
    case 'not_found_error':
    case 'rate_limit_error':
    case 'server_error':
    case 'api_error':
      return type;
    default:
      return fallback;
  }
}

function htmlBodyMessage(body: string | undefined, status: number | undefined): string | undefined {
  if (!body || !HTML_BODY_RE.test(body)) return undefined;
  if (status === 401) {
    return 'Unauthorized: request was blocked by a gateway or proxy. The upstream credentials may be missing or expired.';
  }

  if (status === 403) {
    return 'Forbidden: request was blocked by a gateway or proxy. The upstream credentials may lack permission for this resource.';
  }

  return 'Upstream returned an HTML response. The request likely did not reach the provider.';
}

export function toOpenAIErrorResponse(
  err: unknown,
  opts: ErrorResponseOptions = {},
): { body: OpenAIErrorEnvelope; status: GatewayHttpStatus } {
  return maskOpenAIResponse(toOpenAIErrorResponseUnmasked(err), opts);
}

function toOpenAIErrorResponseUnmasked(err: unknown): {
  body: OpenAIErrorEnvelope;
  status: GatewayHttpStatus;
} {
  if (isGatewayError(err)) {
    return {
      body: {
        error: {
          message: err.message,
          type: GATEWAY_CODE_TO_TYPE[err.code],
          code: err.code,
          param: err.param,
        },
      },
      status: err.status as GatewayHttpStatus,
    };
  }

  if (isUpstreamAbortError(err)) {
    const message = err.message || 'The upstream request timed out.';

    return envelope(message, 'server_error', openAICodeForStatus(504), null, 504);
  }

  if (APICallError.isInstance(err)) {
    return fromAPICallError(err);
  }

  if (AIGatewayError.isInstance(err)) {
    return fromAIGatewayError(err);
  }

  if (isWrappedAIGatewayAuthError(err)) {
    return envelope(
      AI_GATEWAY_AUTH_MESSAGE,
      'authentication_error',
      openAICodeForStatus(401),
      null,
      401,
    );
  }

  if (RetryError.isInstance(err)) {
    const cause = unwrapRetryError(err);

    if (APICallError.isInstance(cause)) {
      return fromAPICallError(cause);
    }

    if (AIGatewayError.isInstance(cause)) {
      return fromAIGatewayError(cause);
    }

    return envelope(err.message, 'server_error', null, null, 502);
  }

  if (NoSuchModelError.isInstance(err)) {
    return envelope(err.message, 'not_found_error', 'model_not_found', 'model', 404);
  }

  if (InvalidPromptError.isInstance(err)) {
    return envelope(err.message, 'invalid_request_error', 'invalid_prompt', null, 400);
  }

  if (TooManyEmbeddingValuesForCallError.isInstance(err)) {
    return envelope(
      err.message,
      'invalid_request_error',
      'too_many_embedding_values',
      'input',
      400,
    );
  }

  if (LoadAPIKeyError.isInstance(err)) {
    return envelope(err.message, 'server_error', 'missing_api_key', null, 500);
  }

  if (JSONParseError.isInstance(err) || TypeValidationError.isInstance(err)) {
    return envelope(
      `Upstream returned a response the gateway could not parse: ${err.message}`,
      'server_error',
      'upstream_invalid_response',
      null,
      502,
    );
  }

  const classified = classifyAiSdkError(err);
  if (classified) {
    const message = err instanceof Error && err.message ? err.message : 'Internal server error';
    if (classified.bucket === 'client') {
      return envelope(message, 'invalid_request_error', openAICodeForStatus(422), null, 422);
    }

    if (classified.bucket === 'upstream') {
      return envelope(message, 'server_error', openAICodeForStatus(502), null, 502);
    }

    return envelope(message, 'server_error', null, null, 500);
  }

  if (AISDKError.isInstance(err)) {
    return envelope(err.message, 'server_error', null, null, 500);
  }

  const message = err instanceof Error && err.message ? err.message : 'Internal server error';

  return envelope(message, 'server_error', null, null, 500);
}

function maskOpenAIResponse(
  result: { body: OpenAIErrorEnvelope; status: GatewayHttpStatus },
  opts: ErrorResponseOptions,
): { body: OpenAIErrorEnvelope; status: GatewayHttpStatus } {
  return {
    ...result,
    body: {
      error: {
        ...result.body.error,
        message: maybeMaskMessage(result.body.error.message, {
          status: result.status,
          requestId: opts.requestId,
          production: opts.production ?? isProduction(),
        }),
      },
    },
  };
}

function fromAPICallError(err: APICallError): {
  body: OpenAIErrorEnvelope;
  status: GatewayHttpStatus;
} {
  if (isUpstreamSuccessStatus(err.statusCode)) {
    return invalidUpstreamResponse(redactKeyFragments(err.message));
  }

  const status = (err.statusCode ?? 500) as GatewayHttpStatus;
  const parsedBody = looseJson(err.data) ?? looseJson(err.responseBody);
  const looseBody = asLooseOpenAIBody(parsedBody);
  const upstreamCode = looseBody?.error.code;
  const upstreamMessage = redactKeyFragments(
    typeof looseBody?.error.message === 'string' ? looseBody.error.message : err.message,
  );

  if (
    isContextOverflow({
      message: err.message,
      status,
      body: parsedBody,
    })
  ) {
    const message = redactKeyFragments(
      (typeof looseBody?.error.message === 'string' && looseBody.error.message) ||
        (err.message && err.message.trim()) ||
        'Input exceeds the context window of this model.',
    );

    return {
      body: {
        error: {
          message,
          type: CONTEXT_OVERFLOW_ENVELOPE.type,
          code: CONTEXT_OVERFLOW_ENVELOPE.code,
          param: CONTEXT_OVERFLOW_ENVELOPE.param,
        },
      },
      status: CONTEXT_OVERFLOW_ENVELOPE.status,
    };
  }

  const htmlMessage =
    typeof err.responseBody === 'string' ? htmlBodyMessage(err.responseBody, status) : undefined;

  if (htmlMessage) {
    return envelope(
      htmlMessage,
      statusToOpenAIType(status),
      openAICodeForStatus(status),
      null,
      status,
    );
  }

  if (hasContentPolicySignal({ status, code: upstreamCode, message: upstreamMessage })) {
    return envelope(
      upstreamMessage,
      'invalid_request_error',
      'content_policy_violation',
      normalizeParam(looseBody?.error.param),
      400,
    );
  }

  if (looseBody && typeof looseBody.error.message === 'string') {
    return {
      body: {
        error: {
          message: upstreamMessage,
          type: normalizeType(looseBody.error.type, statusToOpenAIType(status)),
          code: normalizeCode(upstreamCode) ?? openAICodeForStatus(status),
          param: normalizeParam(looseBody.error.param),
        },
      },
      status,
    };
  }

  const fallbackMessage = redactKeyFragments(
    (err.message && err.message.trim()) ||
      (typeof err.responseBody === 'string' && err.responseBody.trim()) ||
      HTTP_STATUS_TEXT[status] ||
      'Upstream error',
  );

  return envelope(
    fallbackMessage,
    statusToOpenAIType(status),
    openAICodeForStatus(status),
    null,
    status,
  );
}

const AI_GATEWAY_AUTH_MESSAGE = 'AI Gateway authentication failed: Invalid API key or token.';

function isWrappedAIGatewayAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  return (
    err.name === 'GatewayAuthenticationError' ||
    (AISDKError.isInstance(err) && err.name === 'GatewayError')
  );
}

function fromAIGatewayError(err: AIGatewayError): {
  body: OpenAIErrorEnvelope;
  status: GatewayHttpStatus;
} {
  const message = redactKeyFragments(err.message.trim() || 'Upstream error');

  if (isUpstreamSuccessStatus(err.statusCode)) {
    return invalidUpstreamResponse(message);
  }

  const status = err.statusCode as GatewayHttpStatus;
  const upstream = APICallError.isInstance(err.cause) ? err.cause : undefined;
  const parsedBody = looseJson(upstream?.data) ?? looseJson(upstream?.responseBody);

  if (isContextOverflow({ message: err.message, status, body: parsedBody })) {
    return envelope(
      message,
      CONTEXT_OVERFLOW_ENVELOPE.type,
      CONTEXT_OVERFLOW_ENVELOPE.code,
      CONTEXT_OVERFLOW_ENVELOPE.param,
      CONTEXT_OVERFLOW_ENVELOPE.status,
    );
  }

  if (GatewayModelNotFoundError.isInstance(err)) {
    return envelope(message, 'not_found_error', 'model_not_found', 'model', status);
  }

  return envelope(message, statusToOpenAIType(status), openAICodeForStatus(status), null, status);
}

function invalidUpstreamResponse(message: string): {
  body: OpenAIErrorEnvelope;
  status: GatewayHttpStatus;
} {
  return envelope(
    message || 'Upstream returned an invalid response.',
    'server_error',
    'upstream_invalid_response',
    null,
    502,
  );
}

function envelope(
  message: string,
  type: OpenAIErrorType,
  code: string | null,
  param: string | null,
  status: GatewayHttpStatus,
): { body: OpenAIErrorEnvelope; status: GatewayHttpStatus } {
  return {
    body: {
      error: { message: message || 'Internal server error', type, code, param },
    },
    status,
  };
}

export type AnthropicErrorType =
  | 'invalid_request_error'
  | 'authentication_error'
  | 'billing_error'
  | 'permission_error'
  | 'not_found_error'
  | 'request_too_large'
  | 'rate_limit_error'
  | 'timeout_error'
  | 'api_error'
  | 'overloaded_error';

export type AnthropicErrorEnvelope = {
  type: 'error';
  error: {
    type: AnthropicErrorType;
    message: string;
    param?: string | null;
  };
  request_id?: string;
};

export function toAnthropicErrorResponse(
  err: unknown,
  opts: ErrorResponseOptions = {},
): { body: AnthropicErrorEnvelope; status: GatewayHttpStatus } {
  return maskAnthropicResponse(toAnthropicErrorResponseUnmasked(err), opts);
}

function toAnthropicErrorResponseUnmasked(err: unknown): {
  body: AnthropicErrorEnvelope;
  status: GatewayHttpStatus;
} {
  if (isGatewayError(err)) {
    return {
      body: {
        type: 'error',
        error: {
          type: statusToAnthropicType(err.status),
          message: err.message,
          param: err.param,
        },
      },
      status: err.status as GatewayHttpStatus,
    };
  }

  if (isUpstreamAbortError(err)) {
    const message = err.message || 'The upstream request timed out.';

    return anthropicEnvelope(message, 'timeout_error', 504);
  }

  if (APICallError.isInstance(err)) {
    return fromAnthropicAPICallError(err);
  }

  if (AIGatewayError.isInstance(err)) {
    return fromAnthropicAIGatewayError(err);
  }

  if (isWrappedAIGatewayAuthError(err)) {
    return anthropicEnvelope(AI_GATEWAY_AUTH_MESSAGE, 'authentication_error', 401);
  }

  if (RetryError.isInstance(err)) {
    const cause = unwrapRetryError(err);

    if (APICallError.isInstance(cause)) {
      return fromAnthropicAPICallError(cause);
    }

    if (AIGatewayError.isInstance(cause)) {
      return fromAnthropicAIGatewayError(cause);
    }

    return anthropicEnvelope(err.message, 'api_error', 502);
  }

  if (NoSuchModelError.isInstance(err)) {
    return anthropicEnvelope(err.message, 'not_found_error', 404);
  }

  if (InvalidPromptError.isInstance(err)) {
    return anthropicEnvelope(err.message, 'invalid_request_error', 400);
  }

  if (LoadAPIKeyError.isInstance(err)) {
    return anthropicEnvelope(err.message, 'api_error', 500);
  }

  if (JSONParseError.isInstance(err) || TypeValidationError.isInstance(err)) {
    return anthropicEnvelope(
      `Upstream returned a response the gateway could not parse: ${err.message}`,
      'api_error',
      502,
    );
  }

  const classified = classifyAiSdkError(err);
  if (classified) {
    const message = err instanceof Error && err.message ? err.message : 'Internal server error';
    if (classified.bucket === 'client') {
      return anthropicEnvelope(message, 'invalid_request_error', 422);
    }

    if (classified.bucket === 'upstream') {
      return anthropicEnvelope(message, 'api_error', 502);
    }

    return anthropicEnvelope(message, 'api_error', 500);
  }

  if (AISDKError.isInstance(err)) {
    return anthropicEnvelope(err.message, 'api_error', 500);
  }

  const message = err instanceof Error && err.message ? err.message : 'Internal server error';

  return anthropicEnvelope(message, 'api_error', 500);
}

function maskAnthropicResponse(
  result: { body: AnthropicErrorEnvelope; status: GatewayHttpStatus },
  opts: ErrorResponseOptions,
): { body: AnthropicErrorEnvelope; status: GatewayHttpStatus } {
  return {
    ...result,
    body: {
      type: 'error',
      error: {
        ...result.body.error,
        message: maybeMaskMessage(result.body.error.message, {
          status: result.status,
          requestId: opts.requestId,
          production: opts.production ?? isProduction(),
        }),
      },
      ...(opts.requestId ? { request_id: opts.requestId } : {}),
    },
  };
}

function anthropicEnvelope(
  message: string,
  type: AnthropicErrorType,
  status: GatewayHttpStatus,
): { body: AnthropicErrorEnvelope; status: GatewayHttpStatus } {
  return {
    body: {
      type: 'error',
      error: { type, message: message || 'Internal server error' },
    },
    status,
  };
}

function fromAnthropicAPICallError(err: APICallError): {
  body: AnthropicErrorEnvelope;
  status: GatewayHttpStatus;
} {
  if (isUpstreamSuccessStatus(err.statusCode)) {
    return anthropicEnvelope(redactKeyFragments(err.message), 'api_error', 502);
  }

  const status = (err.statusCode ?? 500) as GatewayHttpStatus;
  const parsedBody = looseJson(err.data) ?? looseJson(err.responseBody);
  const anthropicBody = parsedBody as { error?: { message?: string; type?: string } } | undefined;
  const message = redactKeyFragments(
    (typeof anthropicBody?.error?.message === 'string' && anthropicBody.error.message) ||
      (err.message && err.message.trim()) ||
      'An error occurred',
  );

  return {
    body: {
      type: 'error',
      error: {
        type: statusToAnthropicType(status),
        message,
      },
    },
    status,
  };
}

function fromAnthropicAIGatewayError(err: AIGatewayError): {
  body: AnthropicErrorEnvelope;
  status: GatewayHttpStatus;
} {
  const message = redactKeyFragments(err.message.trim() || 'An error occurred');

  if (isUpstreamSuccessStatus(err.statusCode)) {
    return anthropicEnvelope(message, 'api_error', 502);
  }

  const status = err.statusCode as GatewayHttpStatus;

  return anthropicEnvelope(message, statusToAnthropicType(status), status);
}

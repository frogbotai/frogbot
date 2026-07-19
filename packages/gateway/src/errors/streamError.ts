// OpenAI SSE stream-error frame parser.
//
// When upstream providers fail mid-stream they emit a frame on the SSE
// `data:` channel instead of an HTTP error status. The two canonical shapes
// the OpenAI ecosystem produces are:
//
//   Chat / Responses early error:
//     { "type": "error",
//       "error": { "code": "rate_limit_exceeded",
//                  "message": "Rate limit reached",
//                  "type": "rate_limit_error" | null,
//                  "param": null } }
//
//   Responses API completion failure:
//     { "type": "response.failed",
//       "response": { "error": { "code": "server_error",
//                                "message": "response failed" } } }
//
// We also see lightly-malformed variants from OpenRouter / proxies where
// `error.message` is itself a JSON-encoded string of the real envelope.
//
// Streaming routes use this before committing HTTP 200. We build
// it now (with tests) so M1's streaming route only needs to wire it.
//
// Implementation cribbed from `@ai-sdk/openai`'s `openai-stream-error.ts`
// (Apache-2.0, re-licensed MIT for this repo).

import type { OpenAIErrorEnvelope, OpenAIErrorType } from './envelope.js';
import { redactKeyFragments } from './maskMessage.js';
import { statusToOpenAIType } from './statusMaps.js';

export type ParsedStreamErrorFrame = {
  message: string;
  /** Provider-emitted `error.code`. Numeric on some gateways (OpenRouter). */
  code: string | number | null;
  /** Provider-emitted `error.type`, when set. */
  type: string | null;
  /** The original frame, for `responseBody` echo. */
  frame: unknown;
};

/** Try to read an unknown value as a record. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function asStringOrNumber(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

/**
 * Parse a single SSE error frame. Returns `undefined` for non-error frames
 * (caller is expected to filter those out before invoking us, but we tolerate
 * them defensively).
 */
export function parseStreamErrorFrame(frame: unknown): ParsedStreamErrorFrame | undefined {
  // Accept double-encoded JSON in `error.message` (OpenRouter pattern).
  // The outer frame may be a string at this layer if a caller forgot to
  // decode SSE data — handle that too.
  let value = asRecord(frame);
  if (!value && typeof frame === 'string') {
    try {
      const parsed = JSON.parse(frame) as unknown;
      value = asRecord(parsed);
    } catch {
      return undefined;
    }
  }
  if (!value) return undefined;

  // Responses API: `{ type: "response.failed", response: { error: {...} } }`
  if (value.type === 'response.failed') {
    const response = asRecord(value.response);
    const responseError = asRecord(response?.error);
    if (typeof responseError?.message !== 'string') return undefined;
    return {
      message: responseError.message,
      code: asStringOrNumber(responseError.code) ?? null,
      type: 'response.failed',
      frame,
    };
  }

  // Chat / Responses early error: `{ type: "error", error: {...} }`
  // Also tolerate the shape `{ error: {...} }` without an explicit `type`.
  const errorObj = asRecord(value.error) ?? value;
  const message = errorObj.message;
  if (typeof message !== 'string') return undefined;

  // Guard against tagging unrelated objects as errors. Require at least one
  // of the OpenAI-shape signals (the parent had `error` set, OR the obj
  // carries `type`/`code`/`param`).
  const looksLikeError =
    asRecord(value.error) != null ||
    typeof errorObj.type === 'string' ||
    'code' in errorObj ||
    'param' in errorObj;
  if (!looksLikeError) return undefined;

  return {
    message,
    code: asStringOrNumber(errorObj.code) ?? null,
    type: typeof errorObj.type === 'string' ? errorObj.type : null,
    frame,
  };
}

/**
 * Infer an HTTP status code from a parsed stream-error frame. Used when the
 * provider only gave us a string `code` like `"rate_limit_exceeded"` and we
 * need to choose a status for the OpenAI envelope.
 *
 * Order of preference:
 *   1. Numeric `code` that is a valid 4xx/5xx status.
 *   2. Three-digit string `code` that maps to a valid status.
 *   3. Keyword match over `code` + `type`.
 *   4. Fall back to 500.
 */
export function inferStatusFromStreamError(parsed: ParsedStreamErrorFrame): number {
  const { code, type } = parsed;

  if (typeof code === 'number' && isHttpErrorStatus(code)) return code;
  if (typeof code === 'string' && /^\d{3}$/.test(code)) {
    const n = Number(code);
    if (isHttpErrorStatus(n)) return n;
  }

  const haystack = [code, type]
    .filter((v) => typeof v === 'string' || typeof v === 'number')
    .join(' ')
    .toLowerCase();

  if (['insufficient_quota', 'rate_limit', 'too_many_requests'].some((t) => haystack.includes(t))) return 429;
  if (haystack.includes('authentication') || haystack.includes('invalid_api_key')) return 401;
  if (haystack.includes('permission')) return 403;
  if (haystack.includes('not_found')) return 404;
  if (['invalid', 'bad_request', 'context_length'].some((t) => haystack.includes(t))) return 400;
  if (haystack.includes('overload')) return 503;
  if (haystack.includes('timeout')) return 504;

  return 500;
}

function isHttpErrorStatus(n: number): boolean {
  return Number.isInteger(n) && n >= 400 && n <= 599;
}

// ---------------------------------------------------------------------------
// Convenience: stream-error frame → envelope shape
// ---------------------------------------------------------------------------

/**
 * Translate a parsed stream-error frame to the OpenAI envelope.
 *
 * Returns `undefined` if the frame is not parseable as an error. Callers in
 * M1 are expected to use this both for the "early stream error" case (where
 * we abort the response with an HTTP status) and the "mid-stream error" case
 * (where we emit a final SSE event using the envelope body and ignore the
 * status field).
 */
export function streamErrorFrameToEnvelope(
  frame: unknown,
): { body: OpenAIErrorEnvelope; status: number } | undefined {
  const parsed = parseStreamErrorFrame(frame);
  if (!parsed) return undefined;

  const status = inferStatusFromStreamError(parsed);
  const type = inferOpenAIType(parsed, status);

  return {
    body: {
      error: {
        // Stream-error frames carry upstream text verbatim; strip
        // operator-credential fragments before it reaches a client (G34).
        message: redactKeyFragments(parsed.message),
        type,
        code: parsed.code != null ? String(parsed.code) : null,
        param: null,
      },
    },
    status,
  };
}

function inferOpenAIType(parsed: ParsedStreamErrorFrame, status: number): OpenAIErrorType {
  // Shared status→type map (G88). It only falls back to
  // `invalid_request_error` for unmapped 4xx statuses — in that case, prefer
  // a recognized OpenAI type string from the upstream frame.
  const mapped = statusToOpenAIType(status);
  if (mapped !== 'invalid_request_error') return mapped;

  const raw = parsed.type;
  if (raw) {
    if (
      raw === 'invalid_request_error' ||
      raw === 'authentication_error' ||
      raw === 'permission_error' ||
      raw === 'not_found_error' ||
      raw === 'rate_limit_error' ||
      raw === 'server_error' ||
      raw === 'api_error'
    ) {
      return raw;
    }
  }

  return 'invalid_request_error';
}

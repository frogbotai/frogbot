const OVERFLOW_PATTERNS: readonly RegExp[] = [
  /prompt is too long/i,
  /input is too long for requested model/i,
  /exceeds the context window/i,
  /input token count.*exceeds the maximum/i,
  /maximum prompt length is \d+/i,
  /reduce the length of the messages/i,
  /maximum context length is \d+ tokens/i,
  /exceeds the limit of \d+/i,
  /exceeds the available context size/i,
  /greater than the context length/i,
  /context window exceeds limit/i,
  /exceeded model token limit/i,
  /context[_ ]length[_ ]exceeded/i,
  /request entity too large/i,
  /context length is only \d+ tokens/i,
  /input length.*exceeds.*context length/i,
  /prompt too long; exceeded (?:max )?context length/i,
  /too large for model with \d+ maximum context length/i,
  /model_context_window_exceeded/i,
];

const EMPTY_BODY_OVERFLOW = /^4(00|13)\s*(status code)?\s*\(no body\)/i;

/**
 * Detect a context-overflow failure from an upstream error.
 *
 * Inputs we recognize:
 *   - `message`: the AI SDK `APICallError.message` (or any error string).
 *   - `status`:  HTTP status. 413 is always overflow per OpenAI's contract.
 *   - `body`:    parsed JSON body, if any. We check `body.error.code` for
 *                provider-emitted overflow codes.
 */
export function isContextOverflow(input: {
  message?: string;
  status?: number;
  body?: unknown;
}): boolean {
  if (input.status === 413) return true;

  if (input.body && typeof input.body === 'object') {
    const errCode = (input.body as { error?: { code?: unknown } }).error?.code;
    if (errCode === 'context_length_exceeded' || errCode === 'model_context_window_exceeded') {
      return true;
    }
  }

  const msg = input.message ?? '';
  if (!msg) return false;
  if (EMPTY_BODY_OVERFLOW.test(msg)) return true;

  return OVERFLOW_PATTERNS.some((p) => p.test(msg));
}

/** The canonical envelope-side shape we emit for any detected overflow. */
export const CONTEXT_OVERFLOW_ENVELOPE = {
  status: 400 as const,
  code: 'context_length_exceeded' as const,
  type: 'invalid_request_error' as const,
  param: 'messages' as const,
};

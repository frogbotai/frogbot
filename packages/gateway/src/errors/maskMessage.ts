// Error message masking.
//
// Scaffolded in M1; the full production/request-id wiring lands in M5
// alongside the pino logger and request id middleware. For now the helper
// is a pure function so tests and downstream code can depend on the
// contract without waiting for M5.
//
// Contract:
//   - When `production` is `true`, replace the message with a generic
//     "server error" string for 5xx responses. 4xx are passed through
//     because they carry actionable client-side info.
//   - When `production` is `false`, always pass the message through.
//   - The request-id is echoed into the masked message so a support team
//     can correlate a redacted user-facing message to a full server log.
//
// **Ref:** hebo `errors/utils.ts`.

export type MaskMessageOptions = {
  status: number;
  requestId?: string | undefined;
  production: boolean;
};

export function maybeMaskMessage(message: string, opts: MaskMessageOptions): string {
  if (!opts.production) return message;
  if (opts.status < 500) return message;
  return opts.requestId
    ? `Internal server error (request_id: ${opts.requestId}).`
    : 'Internal server error.';
}

// Credential-fragment redaction (G34 / SP4).
//
// Upstream 4xx bodies pass through `maybeMaskMessage` untouched because they
// carry actionable client-side info — but provider 401 bodies can echo a
// fragment of the GATEWAY OPERATOR's API key (e.g. OpenAI's
// "Incorrect API key provided: sk-proj-********abc1"). In a multi-tenant
// gateway the downstream client is not the credential owner, so key-shaped
// tokens are stripped while the rest of the message passes through.
//
// **Ref:** opencode `packages/llm/src/route/executor.ts` `redactedNames`.

const KEY_FRAGMENT_PATTERN = /\b(?:sk|rk|pk|key|token)[-_][A-Za-z0-9*\-_]{8,}/gi;
const BEARER_PATTERN = /\bBearer\s+\S+/gi;

/**
 * Replace key-shaped tokens (`sk-...`, `rk_...`, `Bearer <token>`, ...) in an
 * upstream error message with a redacted placeholder, leaving the rest of the
 * actionable text intact. Pure and unconditional — callers apply it to every
 * upstream-derived message regardless of environment.
 */
export function redactKeyFragments(message: string): string {
  return message
    .replace(KEY_FRAGMENT_PATTERN, '[REDACTED_KEY]')
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]');
}

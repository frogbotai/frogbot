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

const KEY_FRAGMENT_PATTERN = /\b(?:sk|rk|pk|vck|key|token)[-_][A-Za-z0-9*\-_]{8,}/gi;
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

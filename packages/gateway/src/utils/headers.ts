/**
 * Headers that are safe and useful to forward to upstream AI providers.
 *
 * Entries are matched case-insensitively. Glob patterns (`*`) match any suffix.
 * Extend this list when providers add new public headers.
 */
export const FORWARD_HEADER_ALLOWLIST: readonly string[] = [
  'openai-beta',

  'anthropic-beta',
  'anthropic-version',
  'anthropic-dangerous-direct-browser-access',

  'x-amzn-bedrock-*',
  'x-amzn-trace-id',
  'x-amzn-requestid',

  'x-ms-client-*',

  'x-goog-*',
  'x-vertex-*',

  'cf-aig-*',

  'helicone-*',

  'x-portkey-*',

  'x-langsmith-*',
  'langsmith-*',

  'x-bt-*',

  'x-request-id',
  'x-correlation-id',
  'x-trace-id',
  'traceparent',
  'tracestate',

  'x-stainless-*',
  'x-retry-*',

  'accept',
  'accept-encoding',
] as const;

function matchesAllowlist(headerName: string): boolean {
  const lower = headerName.toLowerCase();

  for (const pattern of FORWARD_HEADER_ALLOWLIST) {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (lower.startsWith(prefix)) return true;
    } else {
      if (lower === pattern) return true;
    }
  }

  return false;
}

export interface PrepareForwardHeadersOptions {
  /** Override the user-agent string. Defaults to `@frogbotai/gateway/<version>`. */
  userAgent?: string;
}

const DEFAULT_USER_AGENT = '@frogbotai/gateway/0.0.0';

/**
 * Filter incoming request headers through the allowlist and append the
 * gateway user-agent.
 *
 * @param incoming - The inbound request headers (from the client).
 * @param options - Optional configuration.
 * @returns A new `Headers` instance containing only allowed headers + user-agent.
 */
export function prepareForwardHeaders(
  incoming: Headers,
  options?: PrepareForwardHeadersOptions,
): Headers {
  const forwarded = new Headers();
  const ua = options?.userAgent ?? DEFAULT_USER_AGENT;

  incoming.forEach((value, name) => {
    if (matchesAllowlist(name)) {
      forwarded.set(name, value);
    }
  });

  const existingUA = forwarded.get('user-agent');
  if (existingUA) {
    forwarded.set('user-agent', `${existingUA} ${ua}`);
  } else {
    forwarded.set('user-agent', ua);
  }

  return forwarded;
}

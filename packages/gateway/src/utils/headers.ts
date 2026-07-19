// Header forwarding utilities for the gateway.
//
// Upstream AI providers accept vendor-specific headers (beta flags, version
// pins, tracing IDs, etc.). The gateway must selectively forward these from
// inbound requests while stripping internal/infrastructure headers.
//
// The allowlist approach is safer than a denylist — only explicitly known
// vendor headers pass through.

// ---------------------------------------------------------------------------
// Forward header allowlist
// ---------------------------------------------------------------------------

/**
 * Headers that are safe and useful to forward to upstream AI providers.
 *
 * Entries are matched case-insensitively. Glob patterns (`*`) match any suffix.
 * Extend this list when providers add new public headers.
 */
export const FORWARD_HEADER_ALLOWLIST: readonly string[] = [
  // OpenAI
  // NOTE: `openai-organization` / `openai-project` are intentionally NOT
  // forwarded — a client could override the operator's configured billing
  // org/project (G107). Operators can add them in a `beforeUpstream` hook.
  'openai-beta',

  // Anthropic
  'anthropic-beta',
  'anthropic-version',
  'anthropic-dangerous-direct-browser-access',

  // Amazon Bedrock
  'x-amzn-bedrock-*',
  'x-amzn-trace-id',
  'x-amzn-requestid',

  // Azure OpenAI
  // NOTE: `api-key` (Azure credential bearer) is intentionally NOT forwarded —
  // a client could override the operator's configured credential (G107).
  'x-ms-client-*',

  // Google / Vertex
  'x-goog-*',
  'x-vertex-*',

  // Cloudflare AI Gateway
  'cf-aig-*',

  // Helicone (observability proxy)
  'helicone-*',

  // Portkey
  'x-portkey-*',

  // LangSmith / LangChain
  'x-langsmith-*',
  'langsmith-*',

  // Braintrust
  'x-bt-*',

  // Generic tracing/correlation
  'x-request-id',
  'x-correlation-id',
  'x-trace-id',
  'traceparent',
  'tracestate',

  // Provider-agnostic retry/timeout hints
  'x-stainless-*',
  'x-retry-*',

  // Content negotiation (needed for SSE)
  'accept',
  'accept-encoding',
] as const;

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

/**
 * Check if a header name matches any entry in the allowlist.
 * Supports glob suffix matching (e.g. `x-amzn-bedrock-*` matches
 * `x-amzn-bedrock-guardrailidentifier`).
 */
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

// ---------------------------------------------------------------------------
// prepareForwardHeaders
// ---------------------------------------------------------------------------

export interface PrepareForwardHeadersOptions {
  /** Override the user-agent string. Defaults to `@frogbotai/gateway/<version>`. */
  userAgent?: string;
}

/** Default gateway user-agent appended to outbound requests. */
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

  // Append gateway user-agent (don't override if client sent one that passed)
  const existingUA = forwarded.get('user-agent');
  if (existingUA) {
    forwarded.set('user-agent', `${existingUA} ${ua}`);
  } else {
    forwarded.set('user-agent', ua);
  }

  return forwarded;
}

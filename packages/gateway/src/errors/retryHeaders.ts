// Retry header construction.
//
// When an upstream returns a retryable status (408, 429, 5xx), or its
// error body signals retryability, we want to propagate wire-standard
// retry hints to the client so their SDK (openai, anthropic, langchain,
// etc.) can back off correctly.
//
// Wire hints supported:
//   - `retry-after`      — RFC 7231, either delta-seconds or HTTP-date.
//   - `retry-after-ms`   — Anthropic/OpenAI extension in milliseconds.
//   - `x-should-retry`   — 'true' | 'false'. Anthropic emits this; some
//                          proxies key off it.
//
// We forward upstream `retry-after` (both numeric-seconds and HTTP-date
// forms) verbatim so relative-time semantics survive intact. Absent that,
// we synthesize sensible defaults per status.
//
// **Ref:** hebo `utils/headers.ts`.

/** Retryable HTTP statuses per the gateway's policy. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Build retry-hint headers for a response. `upstreamHeaders` may be
 * `undefined`, a plain object, a `Headers` instance, or a
 * `Record<string, string>` — normalized internally.
 */
export function buildRetryHeaders(args: {
  status: number;
  upstreamHeaders?: Headers | Record<string, string> | undefined;
}): Record<string, string> {
  const out: Record<string, string> = {};
  const retryable = isRetryableStatus(args.status);
  out['x-should-retry'] = retryable ? 'true' : 'false';

  const upstream = normalizeHeaders(args.upstreamHeaders);

  // Prefer upstream retry-after; forward verbatim.
  const upstreamRetryAfter = upstream.get('retry-after');
  const upstreamRetryAfterMs = upstream.get('retry-after-ms');

  if (upstreamRetryAfter) {
    out['retry-after'] = upstreamRetryAfter;
    // Derive ms from delta-seconds when possible so both forms match.
    const asSeconds = Number(upstreamRetryAfter);
    if (Number.isFinite(asSeconds) && asSeconds >= 0 && !upstreamRetryAfterMs) {
      out['retry-after-ms'] = String(Math.round(asSeconds * 1000));
    }
  }
  if (upstreamRetryAfterMs) {
    out['retry-after-ms'] = upstreamRetryAfterMs;
    if (!out['retry-after']) {
      const asMs = Number(upstreamRetryAfterMs);
      if (Number.isFinite(asMs) && asMs >= 0) {
        out['retry-after'] = String(Math.max(1, Math.round(asMs / 1000)));
      }
    }
  }

  // Sensible defaults if the upstream was silent.
  if (retryable && !out['retry-after']) {
    const seconds = args.status === 429 ? 30 : 5;
    out['retry-after'] = String(seconds);
    out['retry-after-ms'] = String(seconds * 1000);
  }

  return out;
}

function normalizeHeaders(
  h: Headers | Record<string, string> | undefined,
): { get: (name: string) => string | undefined } {
  if (!h) return { get: () => undefined };
  if (h instanceof Headers) {
    return { get: (name) => h.get(name) ?? undefined };
  }
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    lower[k.toLowerCase()] = v;
  }
  return { get: (name) => lower[name.toLowerCase()] };
}

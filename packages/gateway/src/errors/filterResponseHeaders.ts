// Response header allowlist.
//
// Upstream provider responses carry many headers we do NOT want to leak
// through the gateway (openai-organization, cf-ray, set-cookie, tracing
// IDs, rate-limit counters that are not client-actionable, etc.). The
// gateway consciously narrows the surface to a small allowlist of
// retry/observability hints.
//
// If callers want richer forwarding they can extend this list via a hook
// in M5. For M1 the allowlist is fixed.

const ALLOWED_HEADERS = new Set([
  'retry-after',
  'retry-after-ms',
  'x-should-retry',
  // The gateway's own request id — added elsewhere; listed here so its
  // presence is intentional even if a route sets it upstream.
  'x-request-id',
]);

/**
 * Filter a header map / Headers instance / plain object down to the
 * allowlist. Casing is normalized; the returned map uses lowercase keys.
 */
export function filterResponseHeaders(input: Headers | Record<string, string> | undefined): Record<string, string> {
  if (!input) return {};

  const out: Record<string, string> = {};

  if (input instanceof Headers) {
    input.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (ALLOWED_HEADERS.has(lower)) {
        out[lower] = value;
      }
    });
    return out;
  }

  for (const [k, v] of Object.entries(input)) {
    const lower = k.toLowerCase();
    if (ALLOWED_HEADERS.has(lower)) {
      out[lower] = v;
    }
  }
  return out;
}

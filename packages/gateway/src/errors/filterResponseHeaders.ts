const ALLOWED_HEADERS = new Set([
  'retry-after',
  'retry-after-ms',
  'x-should-retry',
  'x-request-id',
]);

/**
 * Filter a header map / Headers instance / plain object down to the
 * allowlist. Casing is normalized; the returned map uses lowercase keys.
 */
export function filterResponseHeaders(
  input: Headers | Record<string, string> | undefined,
): Record<string, string> {
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

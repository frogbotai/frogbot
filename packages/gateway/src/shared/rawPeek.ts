export type RawPeekExtras = {
  systemFingerprint?: string;
  serviceTier?: string;
  refusal?: string;
  contentFilterResults?: Record<string, unknown>;
};

/**
 * Peek into a raw provider chunk and extract gateway-relevant fields.
 * Returns undefined if nothing useful is found.
 */
export function peekRawValue(rawValue: unknown): RawPeekExtras | undefined {
  if (typeof rawValue !== 'object' || rawValue === null) return undefined;
  const raw = rawValue as Record<string, unknown>;

  const extras: RawPeekExtras = {};
  let found = false;

  if (typeof raw.system_fingerprint === 'string') {
    extras.systemFingerprint = raw.system_fingerprint;
    found = true;
  }

  if (typeof raw.service_tier === 'string') {
    extras.serviceTier = raw.service_tier;
    found = true;
  }

  const choices = raw.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const delta = (choices[0] as Record<string, unknown>)?.delta;
    if (delta && typeof delta === 'object') {
      const d = delta as Record<string, unknown>;
      if (typeof d.refusal === 'string' && d.refusal.length > 0) {
        extras.refusal = d.refusal;
        found = true;
      }
    }
  }

  const cfr =
    raw.content_filter_results ??
    (Array.isArray(choices) && choices.length > 0
      ? (choices[0] as Record<string, unknown>)?.content_filter_results
      : undefined);

  if (cfr && typeof cfr === 'object') {
    extras.contentFilterResults = cfr as Record<string, unknown>;
    found = true;
  }

  return found ? extras : undefined;
}

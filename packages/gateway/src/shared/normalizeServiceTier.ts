/**
 * Normalizes service_tier values from different providers into a consistent
 * OpenAI-compatible set: 'auto' | 'default' | 'flex' | 'priority' | 'scale'.
 *
 * Providers emit different values:
 * - OpenAI: 'auto', 'flex', 'default', 'scale' (already normalized)
 * - Groq: 'on_demand' → 'default', 'performance' → 'priority'
 * - Bedrock: 'reserved' → 'scale'
 * - Gemini/Vertex: uses `usage_metadata.traffic_type` enum instead
 */

const PROVIDER_TIER_MAP: Record<string, string> = {
  // Groq
  on_demand: 'default',
  performance: 'priority',
  // Bedrock
  reserved: 'scale',
};

const GEMINI_TRAFFIC_TYPE_MAP: Record<string, string> = {
  ON_DEMAND: 'default',
  ON_DEMAND_FLEX: 'flex',
  ON_DEMAND_PRIORITY: 'priority',
  PROVISIONED_THROUGHPUT: 'scale',
  TRAFFIC_TYPE_UNSPECIFIED: 'auto',
};

export function normalizeServiceTier(providerMetadata?: Record<string, Record<string, unknown>>): string | undefined {
  if (!providerMetadata) return undefined;

  // Check each known provider namespace for service_tier
  for (const [namespace, metadata] of Object.entries(providerMetadata)) {
    if (!metadata || typeof metadata !== 'object') continue;

    // Direct service_tier field (OpenAI, Groq, Bedrock)
    if (typeof metadata.service_tier === 'string') {
      const raw = metadata.service_tier;
      return PROVIDER_TIER_MAP[raw] ?? raw;
    }

    // Gemini/Vertex traffic_type fallback
    if (namespace === 'vertex' || namespace === 'google') {
      const usageMeta = metadata.usage_metadata;
      if (usageMeta && typeof usageMeta === 'object') {
        const trafficType = (usageMeta as Record<string, unknown>).traffic_type;
        if (typeof trafficType === 'string') {
          return GEMINI_TRAFFIC_TYPE_MAP[trafficType] ?? 'auto';
        }
      }
    }
  }

  return undefined;
}

const PROVIDER_TIER_MAP: Record<string, string> = {
  on_demand: 'default',
  performance: 'priority',
  reserved: 'scale',
};

const GEMINI_TRAFFIC_TYPE_MAP: Record<string, string> = {
  ON_DEMAND: 'default',
  ON_DEMAND_FLEX: 'flex',
  ON_DEMAND_PRIORITY: 'priority',
  PROVISIONED_THROUGHPUT: 'scale',
  TRAFFIC_TYPE_UNSPECIFIED: 'auto',
};

export function normalizeServiceTier(
  providerMetadata?: Record<string, Record<string, unknown>>,
): string | undefined {
  if (!providerMetadata) return undefined;

  for (const [namespace, metadata] of Object.entries(providerMetadata)) {
    if (!metadata || typeof metadata !== 'object') continue;

    if (typeof metadata.service_tier === 'string') {
      const raw = metadata.service_tier;

      return PROVIDER_TIER_MAP[raw] ?? raw;
    }

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

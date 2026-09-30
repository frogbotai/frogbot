import { calculateCostUSD, calculateModelCostUSD, type HookUsage } from '@frogbotai/gateway';

import { isCustomProvider } from './isCustomProvider.js';
import type { ProviderConfig } from './types.js';

export function calculateUsageCostUSD({
  model,
  providers,
  usage,
}: {
  model: string;
  providers?: ProviderConfig;
  usage: HookUsage;
}): number {
  const separator = model.indexOf('/');
  const entry = separator > 0 ? providers?.[model.slice(0, separator)] : undefined;

  const configured = isCustomProvider(entry)
    ? entry.models.find((candidate) => candidate.id === model.slice(separator + 1))?.cost
    : undefined;

  if (!configured) return calculateModelCostUSD(model, usage);

  return calculateCostUSD(usage, {
    input: configured.input ?? 0,
    output: configured.output ?? 0,
    ...(configured.cache_read !== undefined && { cache_read: configured.cache_read }),
  });
}

import { canonicalizeModelId, DEFAULT_MODEL_CATALOG } from '@frogbotai/gateway';

import { isCustomProvider } from './isCustomProvider.js';
import type { SanitizedAIConfig } from './types.js';

export function resolveModelName({
  config,
  model,
}: {
  config: SanitizedAIConfig;
  model: string;
}): string | undefined {
  const separator = model.indexOf('/');

  if (separator <= 0 || config.routers[model]) return undefined;

  const provider = model.slice(0, separator);
  const entry = config.providers[provider];

  if (isCustomProvider(entry)) {
    return entry.models.find((candidate) => candidate.id === model.slice(separator + 1))?.name;
  }

  return DEFAULT_MODEL_CATALOG.get(canonicalizeModelId(model))?.name;
}

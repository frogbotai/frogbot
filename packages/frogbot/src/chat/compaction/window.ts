import { canonicalizeModelId, DEFAULT_MODEL_CATALOG } from '@frogbotai/gateway';

import { isCustomProvider } from '../../ai/isCustomProvider.js';
import { resolveModel } from '../../ai/resolve.js';
import type { SanitizedAIConfig } from '../../ai/types.js';

export function contextWindow({
  config,
  model,
}: {
  config: SanitizedAIConfig;
  model: string;
}): number | undefined {
  const id = resolveModel(model, config);
  const separator = id.indexOf('/');

  if (separator <= 0) return undefined;

  const entry = config.providers[id.slice(0, separator)];

  if (isCustomProvider(entry)) {
    const custom = entry.models.find((candidate) => candidate.id === id.slice(separator + 1));

    return positive(custom?.limit?.input) ?? positive(custom?.limit?.context);
  }

  return positive(DEFAULT_MODEL_CATALOG.get(canonicalizeModelId(id))?.context.input);
}

function positive(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? value : undefined;
}

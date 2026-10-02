import { canonicalizeModelId, DEFAULT_MODEL_CATALOG } from '@frogbotai/gateway';

import { isCustomProvider } from './isCustomProvider.js';
import { resolveModel } from './resolve.js';
import type { ModelModality, SanitizedAIConfig } from './types.js';

export type ResolvedModelInputs = {
  inputs?: ModelModality[];
  provider: string;
};

const MODEL_MODALITIES = new Set<string>(['text', 'image', 'audio', 'video', 'pdf']);

function isModelModality(value: string): value is ModelModality {
  return MODEL_MODALITIES.has(value);
}

export function resolveModelInputs({
  config,
  model,
}: {
  config: SanitizedAIConfig;
  model: string;
}): ResolvedModelInputs {
  const id = resolveModel(model, config);
  const separator = id.indexOf('/');

  if (separator <= 0) return { provider: '' };

  const provider = id.slice(0, separator);
  const entry = config.providers[provider];

  if (isCustomProvider(entry)) {
    const custom = entry.models.find((candidate) => candidate.id === id.slice(separator + 1));

    return { inputs: custom?.modalities?.input, provider };
  }

  const catalog = DEFAULT_MODEL_CATALOG.get(canonicalizeModelId(id));

  return { inputs: catalog?.modalities.input.filter(isModelModality), provider };
}

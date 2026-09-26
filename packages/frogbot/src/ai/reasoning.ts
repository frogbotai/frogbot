import type { ReasoningVariant } from '@frogbotai/gateway';
import {
  canonicalizeModelId,
  DEFAULT_MODEL_CATALOG,
  resolveReasoningVariants,
} from '@frogbotai/gateway';

import { resolveModel } from './resolve.js';
import type { CustomProviderEntry, ProviderConfig, SanitizedAIConfig } from './types.js';

function isCustomProvider(entry: ProviderConfig[string]): entry is CustomProviderEntry {
  return typeof entry === 'object' && 'type' in entry && entry.type === 'openai-compatible';
}

function toCamelCase(name: string): string {
  return name.replace(/[_-]([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function resolveModelReasoning({
  config,
  model,
}: {
  config: SanitizedAIConfig;
  model: string;
}): ReasoningVariant[] {
  const id = resolveModel(model, config);
  const separator = id.indexOf('/');

  if (separator <= 0) return [];

  const provider = id.slice(0, separator);
  const entry = config.providers[provider];

  if (isCustomProvider(entry)) {
    const custom = entry.models.find((candidate) => candidate.id === id.slice(separator + 1));

    return resolveReasoningVariants({
      modelId: id,
      options: custom?.reasoningOptions,
      outputLimit: custom?.limit?.output,
      providerOptionsName: toCamelCase(provider),
    });
  }

  const canonical = canonicalizeModelId(id);
  const catalog = DEFAULT_MODEL_CATALOG.get(canonical);

  return resolveReasoningVariants({
    modelId: canonical,
    options: catalog?.capabilities.reasoningOptions,
    outputLimit: catalog?.context.output,
  });
}

import type { ReasoningVariant } from '@frogbotai/gateway';
import {
  canonicalizeModelId,
  DEFAULT_MODEL_CATALOG,
  resolveReasoningVariants,
} from '@frogbotai/gateway';

import { isCustomProvider } from './isCustomProvider.js';
import { resolveModel } from './resolve.js';
import type { ModelConfig, SanitizedAIConfig } from './types.js';

const DEFAULT_CUSTOM_REASONING_OPTIONS: ModelConfig['reasoningOptions'] = [
  { type: 'effort', values: ['low', 'medium', 'high'] },
];

function toCamelCase(name: string): string {
  return name.replace(/[_-]([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function customReasoningOptions(model: ModelConfig | undefined): ModelConfig['reasoningOptions'] {
  if (model?.reasoning === false) return undefined;

  if (model?.reasoning === true && model.reasoningOptions === undefined) {
    return DEFAULT_CUSTOM_REASONING_OPTIONS;
  }

  return model?.reasoningOptions;
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
      options: customReasoningOptions(custom),
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

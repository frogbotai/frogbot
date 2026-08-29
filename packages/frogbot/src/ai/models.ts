import type { AIConfig, CustomProviderEntry, SanitizedAIConfig } from './types.js';
import { catalog } from './catalog.js';
import { getGatewayProviderName, isProviderName } from './providerNames.js';

export function getConfiguredModelIds(ai: AIConfig | SanitizedAIConfig | undefined): string[] {
  if (!ai) return [];
  const modelIds = new Set<string>();
  for (const [provider, entry] of Object.entries(ai.providers)) {
    if (!entry) continue;
    const runtimeProvider = isProviderName(provider) ? getGatewayProviderName(provider) : provider;
    const allowlist =
      (entry as CustomProviderEntry).type === 'openai-compatible'
        ? undefined
        : (entry as { models?: string[] }).models;
    for (const model of catalog) {
      const modelName = model.id.slice(model.id.indexOf('/') + 1);
      if (model.provider === runtimeProvider && (!allowlist || allowlist.includes(modelName))) {
        modelIds.add(`${runtimeProvider}/${modelName}`);
      }
    }
    if ((entry as CustomProviderEntry).type === 'openai-compatible') {
      for (const model of (entry as CustomProviderEntry).models) {
        modelIds.add(`${provider}/${model.id}`);
      }
    }
  }
  for (const slug of Object.keys(ai.routers ?? {})) modelIds.add(slug);
  return [...modelIds].sort();
}

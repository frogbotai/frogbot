// Model catalog — static snapshot of known model IDs from built-in providers.
// Filtered at runtime to only include models from configured providers.

import type { ModelMode } from '../types/ai.js';

import catalogData from './catalog.json' with { type: 'json' };

export type CatalogEntry = {
  id: string;
  provider: string;
  mode: ModelMode;
};

const catalog: CatalogEntry[] = catalogData as CatalogEntry[];

export function getFilteredCatalog(configuredProviders: Set<string>): CatalogEntry[] {
  return catalog.filter((entry) => configuredProviders.has(entry.provider));
}

export function getAllModelIds(configuredProviders: Set<string>): string[] {
  return getFilteredCatalog(configuredProviders).map((entry) => entry.id);
}

export function isKnownModelId(id: string, configuredProviders: Set<string>): boolean {
  return catalog.some((entry) => entry.id === id && configuredProviders.has(entry.provider));
}

export { catalog };

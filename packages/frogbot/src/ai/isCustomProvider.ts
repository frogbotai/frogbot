import type { CustomProviderEntry, ProviderConfig } from './types.js';

export function isCustomProvider(entry: ProviderConfig[string]): entry is CustomProviderEntry {
  return typeof entry === 'object' && 'type' in entry && entry.type === 'openai-compatible';
}

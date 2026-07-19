import {
  createVoyage,
  type VoyageProvider,
  type VoyageProviderSettings,
} from '@ai-sdk/voyage';

import type { ProviderDefinition } from '../types.js';

export type VoyageConfig = Omit<VoyageProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey: string;
};

export const voyageProvider = {
  name: 'voyage',
  requiredKeys: ['apiKey'],
  envVars: ['VOYAGE_API_KEY', 'VOYAGE_BASE_URL'],
  fromEnv: (env) => {
    if (!env.VOYAGE_API_KEY) return undefined;
    return {
      apiKey: env.VOYAGE_API_KEY,
      ...(env.VOYAGE_BASE_URL && { baseURL: env.VOYAGE_BASE_URL }),
    };
  },
  build: (cfg) => createVoyage(cfg),
} satisfies ProviderDefinition<'voyage', VoyageConfig, VoyageProvider>;

import { createHume, type HumeProvider, type HumeProviderSettings } from '@ai-sdk/hume';

import type { ProviderDefinition } from '../types.js';

export type HumeConfig = Omit<HumeProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey: string;
};

export const humeProvider = {
  name: 'hume',
  requiredKeys: ['apiKey'],
  envVars: ['HUME_API_KEY'],
  fromEnv: (env) => {
    if (!env.HUME_API_KEY) return undefined;
    return { apiKey: env.HUME_API_KEY };
  },
  build: (cfg) => createHume(cfg),
} satisfies ProviderDefinition<'hume', HumeConfig, HumeProvider>;

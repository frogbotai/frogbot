import { createProdia, type ProdiaProvider, type ProdiaProviderSettings } from '@ai-sdk/prodia';

import type { ProviderDefinition } from '../types.js';

export type ProdiaConfig = Omit<ProdiaProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const prodiaProvider = {
  name: 'prodia',
  requiredKeys: ['apiKey'],
  envVars: ['PRODIA_TOKEN', 'PRODIA_BASE_URL'],
  fromEnv: (env) => {
    if (!env.PRODIA_TOKEN) return undefined;
    return {
      apiKey: env.PRODIA_TOKEN,
      ...(env.PRODIA_BASE_URL && { baseURL: env.PRODIA_BASE_URL }),
    };
  },
  build: (cfg) => createProdia(cfg),
} satisfies ProviderDefinition<'prodia', ProdiaConfig, ProdiaProvider>;

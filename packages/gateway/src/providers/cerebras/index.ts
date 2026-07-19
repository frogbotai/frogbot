// Provider definition: Cerebras.

import {
  createCerebras,
  type CerebrasProvider,
  type CerebrasProviderSettings,
} from '@ai-sdk/cerebras';

import type { ProviderDefinition } from '../types.js';

export type CerebrasConfig = Omit<CerebrasProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey: string;
};

export const cerebrasProvider = {
  name: 'cerebras',
  requiredKeys: ['apiKey'],
  envVars: ['CEREBRAS_API_KEY', 'CEREBRAS_BASE_URL'],
  fromEnv: (env) => {
    if (!env.CEREBRAS_API_KEY) return undefined;
    return {
      apiKey: env.CEREBRAS_API_KEY,
      ...(env.CEREBRAS_BASE_URL && { baseURL: env.CEREBRAS_BASE_URL }),
    };
  },
  build: (cfg) => createCerebras(cfg),
} satisfies ProviderDefinition<'cerebras', CerebrasConfig, CerebrasProvider>;

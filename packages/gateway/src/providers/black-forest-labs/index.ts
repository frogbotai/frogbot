import {
  createBlackForestLabs,
  type BlackForestLabsProvider,
  type BlackForestLabsProviderSettings,
} from '@ai-sdk/black-forest-labs';

import type { ProviderDefinition } from '../types.js';

export type BlackForestLabsConfig = Omit<BlackForestLabsProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const blackForestLabsProvider = {
  name: 'black-forest-labs',
  requiredKeys: ['apiKey'],
  envVars: ['BFL_API_KEY', 'BFL_BASE_URL'],
  fromEnv: (env) => {
    if (!env.BFL_API_KEY) return undefined;
    return {
      apiKey: env.BFL_API_KEY,
      ...(env.BFL_BASE_URL && { baseURL: env.BFL_BASE_URL }),
    };
  },
  build: (cfg) => createBlackForestLabs(cfg),
} satisfies ProviderDefinition<'black-forest-labs', BlackForestLabsConfig, BlackForestLabsProvider>;

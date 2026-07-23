import { createFal, type FalProvider, type FalProviderSettings } from '@ai-sdk/fal';

import type { ProviderDefinition } from '../types.js';

export type FalConfig = Omit<FalProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const falProvider = {
  name: 'fal',
  requiredKeys: ['apiKey'],
  envVars: ['FAL_API_KEY', 'FAL_KEY', 'FAL_BASE_URL'],
  fromEnv: (env) => {
    const apiKey = env.FAL_API_KEY ?? env.FAL_KEY;
    if (!apiKey) return undefined;
    return {
      apiKey,
      ...(env.FAL_BASE_URL && { baseURL: env.FAL_BASE_URL }),
    };
  },
  build: (cfg) => createFal(cfg),
} satisfies ProviderDefinition<'fal', FalConfig, FalProvider>;

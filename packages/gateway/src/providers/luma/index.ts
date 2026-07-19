import { createLuma, type LumaProvider, type LumaProviderSettings } from '@ai-sdk/luma';

import type { ProviderDefinition } from '../types.js';

export type LumaConfig = Omit<LumaProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey: string;
};

export const lumaProvider = {
  name: 'luma',
  requiredKeys: ['apiKey'],
  envVars: ['LUMA_API_KEY', 'LUMA_BASE_URL'],
  fromEnv: (env) => {
    if (!env.LUMA_API_KEY) return undefined;
    return {
      apiKey: env.LUMA_API_KEY,
      ...(env.LUMA_BASE_URL && { baseURL: env.LUMA_BASE_URL }),
    };
  },
  build: (cfg) => createLuma(cfg),
} satisfies ProviderDefinition<'luma', LumaConfig, LumaProvider>;

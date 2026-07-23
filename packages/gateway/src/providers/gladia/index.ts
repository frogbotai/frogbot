import { createGladia, type GladiaProvider, type GladiaProviderSettings } from '@ai-sdk/gladia';

import type { ProviderDefinition } from '../types.js';

export type GladiaConfig = Omit<GladiaProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const gladiaProvider = {
  name: 'gladia',
  requiredKeys: ['apiKey'],
  envVars: ['GLADIA_API_KEY'],
  fromEnv: (env) => {
    if (!env.GLADIA_API_KEY) return undefined;
    return { apiKey: env.GLADIA_API_KEY };
  },
  build: (cfg) => createGladia(cfg),
} satisfies ProviderDefinition<'gladia', GladiaConfig, GladiaProvider>;

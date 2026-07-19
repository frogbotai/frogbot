// Provider definition: Vercel.

import {
  createVercel,
  type VercelProvider,
  type VercelProviderSettings,
} from '@ai-sdk/vercel';

import type { ProviderDefinition } from '../types.js';

export type VercelConfig = Omit<VercelProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey: string;
};

export const vercelProvider = {
  name: 'vercel',
  requiredKeys: ['apiKey'],
  envVars: ['VERCEL_API_KEY', 'VERCEL_BASE_URL'],
  fromEnv: (env) => {
    if (!env.VERCEL_API_KEY) return undefined;
    return {
      apiKey: env.VERCEL_API_KEY,
      ...(env.VERCEL_BASE_URL && { baseURL: env.VERCEL_BASE_URL }),
    };
  },
  build: (cfg) => createVercel(cfg),
} satisfies ProviderDefinition<'vercel', VercelConfig, VercelProvider>;

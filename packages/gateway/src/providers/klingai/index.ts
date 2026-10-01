import { createKlingAI, type KlingAIProvider, type KlingAIProviderSettings } from '@ai-sdk/klingai';

import type { ProviderDefinition } from '../types.js';

export type KlingAIConfig = Omit<KlingAIProviderSettings, 'accessKey' | 'secretKey' | 'fetch'> & {
  accessKey?: string;
  secretKey?: string;
};

export const klingaiProvider = {
  name: 'klingai',
  credentials: [
    { apiKey: 'KLINGAI_API_KEY' },
    { accessKey: 'KLINGAI_ACCESS_KEY', secretKey: 'KLINGAI_SECRET_KEY' },
  ] as const,
  envVars: ['KLINGAI_API_KEY', 'KLINGAI_ACCESS_KEY', 'KLINGAI_SECRET_KEY', 'KLINGAI_BASE_URL'],
  fromEnv: (env) => {
    const baseURL = env.KLINGAI_BASE_URL ? { baseURL: env.KLINGAI_BASE_URL } : {};

    if (env.KLINGAI_API_KEY) {
      return { apiKey: env.KLINGAI_API_KEY, ...baseURL };
    }

    if (!env.KLINGAI_ACCESS_KEY || !env.KLINGAI_SECRET_KEY) return undefined;

    return { accessKey: env.KLINGAI_ACCESS_KEY, secretKey: env.KLINGAI_SECRET_KEY, ...baseURL };
  },
  build: (cfg) => createKlingAI(cfg),
} satisfies ProviderDefinition<'klingai', KlingAIConfig, KlingAIProvider>;

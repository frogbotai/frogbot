import { createKlingAI, type KlingAIProvider, type KlingAIProviderSettings } from '@ai-sdk/klingai';

import type { ProviderDefinition } from '../types.js';

export type KlingAIConfig = Omit<KlingAIProviderSettings, 'accessKey' | 'secretKey' | 'fetch'> & {
  accessKey?: string;
  secretKey?: string;
};

export const klingaiProvider = {
  name: 'klingai',
  requiredKeys: ['accessKey', 'secretKey'],
  envVars: ['KLINGAI_ACCESS_KEY', 'KLINGAI_SECRET_KEY', 'KLINGAI_BASE_URL'],
  fromEnv: (env) => {
    if (!env.KLINGAI_ACCESS_KEY || !env.KLINGAI_SECRET_KEY) return undefined;
    return {
      accessKey: env.KLINGAI_ACCESS_KEY,
      secretKey: env.KLINGAI_SECRET_KEY,
      ...(env.KLINGAI_BASE_URL && { baseURL: env.KLINGAI_BASE_URL }),
    };
  },
  build: (cfg) => createKlingAI(cfg),
} satisfies ProviderDefinition<'klingai', KlingAIConfig, KlingAIProvider>;

import { createLMNT, type LMNTProvider, type LMNTProviderSettings } from '@ai-sdk/lmnt';

import type { ProviderDefinition } from '../types.js';

export type LMNTConfig = Omit<LMNTProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const lmntProvider = {
  name: 'lmnt',
  requiredKeys: ['apiKey'],
  envVars: ['LMNT_API_KEY'],
  fromEnv: (env) => {
    if (!env.LMNT_API_KEY) return undefined;
    return { apiKey: env.LMNT_API_KEY };
  },
  build: (cfg) => createLMNT(cfg),
} satisfies ProviderDefinition<'lmnt', LMNTConfig, LMNTProvider>;

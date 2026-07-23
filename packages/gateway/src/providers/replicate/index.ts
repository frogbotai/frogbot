import {
  createReplicate,
  type ReplicateProvider,
  type ReplicateProviderSettings,
} from '@ai-sdk/replicate';

import type { ProviderDefinition } from '../types.js';

export type ReplicateConfig = Omit<ReplicateProviderSettings, 'apiToken' | 'fetch'> & {
  apiToken?: string;
};

export const replicateProvider = {
  name: 'replicate',
  requiredKeys: ['apiToken'],
  envVars: ['REPLICATE_API_TOKEN', 'REPLICATE_BASE_URL'],
  fromEnv: (env) => {
    if (!env.REPLICATE_API_TOKEN) return undefined;
    return {
      apiToken: env.REPLICATE_API_TOKEN,
      ...(env.REPLICATE_BASE_URL && { baseURL: env.REPLICATE_BASE_URL }),
    };
  },
  build: (cfg) => createReplicate(cfg),
} satisfies ProviderDefinition<'replicate', ReplicateConfig, ReplicateProvider>;

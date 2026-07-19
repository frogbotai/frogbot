// Provider definition: Cohere.

import {
  createCohere,
  type CohereProvider,
  type CohereProviderSettings,
} from '@ai-sdk/cohere';

import type { ProviderDefinition } from '../types.js';

export type CohereConfig = Omit<CohereProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey: string;
};

export const cohereProvider = {
  name: 'cohere',
  requiredKeys: ['apiKey'],
  envVars: ['COHERE_API_KEY', 'COHERE_BASE_URL'],
  fromEnv: (env) => {
    if (!env.COHERE_API_KEY) return undefined;
    return {
      apiKey: env.COHERE_API_KEY,
      ...(env.COHERE_BASE_URL && { baseURL: env.COHERE_BASE_URL }),
    };
  },
  build: (cfg) => createCohere(cfg),
} satisfies ProviderDefinition<'cohere', CohereConfig, CohereProvider>;

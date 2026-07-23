// Provider definition: Perplexity.

import {
  createPerplexity,
  type PerplexityProvider,
  type PerplexityProviderSettings,
} from '@ai-sdk/perplexity';

import type { ProviderDefinition } from '../types.js';

export type PerplexityConfig = Omit<PerplexityProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const perplexityProvider = {
  name: 'perplexity',
  requiredKeys: ['apiKey'],
  envVars: ['PERPLEXITY_API_KEY', 'PERPLEXITY_BASE_URL'],
  fromEnv: (env) => {
    if (!env.PERPLEXITY_API_KEY) return undefined;
    return {
      apiKey: env.PERPLEXITY_API_KEY,
      ...(env.PERPLEXITY_BASE_URL && { baseURL: env.PERPLEXITY_BASE_URL }),
    };
  },
  build: (cfg) => createPerplexity(cfg),
} satisfies ProviderDefinition<'perplexity', PerplexityConfig, PerplexityProvider>;

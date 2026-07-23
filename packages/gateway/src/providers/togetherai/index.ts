// Provider definition: Together AI.

import {
  createTogetherAI,
  type TogetherAIProvider,
  type TogetherAIProviderSettings,
} from '@ai-sdk/togetherai';

import type { ProviderDefinition } from '../types.js';

export type TogetherAIConfig = Omit<TogetherAIProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const togetheraiProvider = {
  name: 'togetherai',
  requiredKeys: ['apiKey'],
  envVars: ['TOGETHER_API_KEY', 'TOGETHER_BASE_URL'],
  fromEnv: (env) => {
    if (!env.TOGETHER_API_KEY) return undefined;
    return {
      apiKey: env.TOGETHER_API_KEY,
      ...(env.TOGETHER_BASE_URL && { baseURL: env.TOGETHER_BASE_URL }),
    };
  },
  build: (cfg) => createTogetherAI(cfg),
} satisfies ProviderDefinition<'togetherai', TogetherAIConfig, TogetherAIProvider>;

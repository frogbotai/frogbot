// Provider definition: Moonshot AI.

import {
  createMoonshotAI,
  type MoonshotAIProvider,
  type MoonshotAIProviderSettings,
} from '@ai-sdk/moonshotai';

import type { ProviderDefinition } from '../types.js';

export type MoonshotAIConfig = Omit<MoonshotAIProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const moonshotaiProvider = {
  name: 'moonshotai',
  requiredKeys: ['apiKey'],
  envVars: ['MOONSHOT_API_KEY', 'MOONSHOT_BASE_URL'],
  fromEnv: (env) => {
    if (!env.MOONSHOT_API_KEY) return undefined;
    return {
      apiKey: env.MOONSHOT_API_KEY,
      ...(env.MOONSHOT_BASE_URL && { baseURL: env.MOONSHOT_BASE_URL }),
    };
  },
  build: (cfg) => createMoonshotAI(cfg),
} satisfies ProviderDefinition<'moonshotai', MoonshotAIConfig, MoonshotAIProvider>;

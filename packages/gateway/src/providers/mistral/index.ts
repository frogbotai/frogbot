// Provider definition: Mistral.

import {
  createMistral,
  type MistralProvider,
  type MistralProviderSettings,
} from '@ai-sdk/mistral';

import type { ProviderDefinition } from '../types.js';

export type MistralConfig = Omit<MistralProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const mistralProvider = {
  name: 'mistral',
  requiredKeys: ['apiKey'],
  envVars: ['MISTRAL_API_KEY', 'MISTRAL_BASE_URL'],
  fromEnv: (env) => {
    if (!env.MISTRAL_API_KEY) return undefined;
    return {
      apiKey: env.MISTRAL_API_KEY,
      ...(env.MISTRAL_BASE_URL && { baseURL: env.MISTRAL_BASE_URL }),
    };
  },
  build: (cfg) => createMistral(cfg),
} satisfies ProviderDefinition<'mistral', MistralConfig, MistralProvider>;

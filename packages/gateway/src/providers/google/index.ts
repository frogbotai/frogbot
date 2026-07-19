// Provider definition: Google Generative AI.

import {
  createGoogle,
  type GoogleProvider,
  type GoogleProviderSettings,
} from '@ai-sdk/google';

import type { ProviderDefinition } from '../types.js';

export type GoogleConfig = Omit<GoogleProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey: string;
};

export const googleProvider = {
  name: 'google',
  requiredKeys: ['apiKey'],
  envVars: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_BASE_URL'],
  fromEnv: (env) => {
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY) return undefined;
    return {
      apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
      ...(env.GOOGLE_BASE_URL && { baseURL: env.GOOGLE_BASE_URL }),
    };
  },
  build: (cfg) => createGoogle(cfg),
} satisfies ProviderDefinition<'google', GoogleConfig, GoogleProvider>;

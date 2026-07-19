// Provider definition: Groq.

import { createGroq, type GroqProvider, type GroqProviderSettings } from '@ai-sdk/groq';

import type { ProviderDefinition } from '../types.js';

export type GroqConfig = Omit<GroqProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey: string;
};

export const groqProvider = {
  name: 'groq',
  requiredKeys: ['apiKey'],
  envVars: ['GROQ_API_KEY', 'GROQ_BASE_URL'],
  fromEnv: (env) => {
    if (!env.GROQ_API_KEY) return undefined;
    return {
      apiKey: env.GROQ_API_KEY,
      ...(env.GROQ_BASE_URL && { baseURL: env.GROQ_BASE_URL }),
    };
  },
  build: (cfg) => createGroq(cfg),
} satisfies ProviderDefinition<'groq', GroqConfig, GroqProvider>;

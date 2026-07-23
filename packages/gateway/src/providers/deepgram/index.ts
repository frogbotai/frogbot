import { createDeepgram, type DeepgramProvider, type DeepgramProviderSettings } from '@ai-sdk/deepgram';

import type { ProviderDefinition } from '../types.js';

export type DeepgramConfig = Omit<DeepgramProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const deepgramProvider = {
  name: 'deepgram',
  requiredKeys: ['apiKey'],
  envVars: ['DEEPGRAM_API_KEY'],
  fromEnv: (env) => {
    if (!env.DEEPGRAM_API_KEY) return undefined;
    return { apiKey: env.DEEPGRAM_API_KEY };
  },
  build: (cfg) => createDeepgram(cfg),
} satisfies ProviderDefinition<'deepgram', DeepgramConfig, DeepgramProvider>;

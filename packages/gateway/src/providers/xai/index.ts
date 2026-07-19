// Provider definition: xAI.

import { createXai, type XaiProvider, type XaiProviderSettings } from '@ai-sdk/xai';

import type { ProviderDefinition } from '../types.js';

export type XaiConfig = Omit<XaiProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey: string;
};

export const xaiProvider = {
  name: 'xai',
  requiredKeys: ['apiKey'],
  envVars: ['XAI_API_KEY', 'XAI_BASE_URL'],
  fromEnv: (env) => {
    if (!env.XAI_API_KEY) return undefined;
    return {
      apiKey: env.XAI_API_KEY,
      ...(env.XAI_BASE_URL && { baseURL: env.XAI_BASE_URL }),
    };
  },
  build: (cfg) => createXai(cfg),
} satisfies ProviderDefinition<'xai', XaiConfig, XaiProvider>;

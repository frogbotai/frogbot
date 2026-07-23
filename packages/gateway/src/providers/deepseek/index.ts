// Provider definition: DeepSeek.

import {
  createDeepSeek,
  type DeepSeekProvider,
  type DeepSeekProviderSettings,
} from '@ai-sdk/deepseek';

import type { ProviderDefinition } from '../types.js';

export type DeepSeekConfig = Omit<DeepSeekProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const deepseekProvider = {
  name: 'deepseek',
  requiredKeys: ['apiKey'],
  envVars: ['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL'],
  fromEnv: (env) => {
    if (!env.DEEPSEEK_API_KEY) return undefined;
    return {
      apiKey: env.DEEPSEEK_API_KEY,
      ...(env.DEEPSEEK_BASE_URL && { baseURL: env.DEEPSEEK_BASE_URL }),
    };
  },
  build: (cfg) => createDeepSeek(cfg),
} satisfies ProviderDefinition<'deepseek', DeepSeekConfig, DeepSeekProvider>;

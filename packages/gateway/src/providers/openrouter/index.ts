// Provider definition: OpenRouter.

import {
  createOpenRouter,
  type OpenRouterProvider,
  type OpenRouterProviderSettings,
} from '@openrouter/ai-sdk-provider';

import type { ProviderDefinition } from '../types.js';

export type OpenRouterConfig = Omit<OpenRouterProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const openrouterProvider = {
  name: 'openrouter',
  requiredKeys: ['apiKey'],
  envVars: ['OPENROUTER_API_KEY', 'OPENROUTER_BASE_URL'],
  fromEnv: (env) => {
    if (!env.OPENROUTER_API_KEY) return undefined;

    return {
      apiKey: env.OPENROUTER_API_KEY,
      ...(env.OPENROUTER_BASE_URL && { baseURL: env.OPENROUTER_BASE_URL }),
    };
  },
  build: (cfg) =>
    createOpenRouter({ appName: 'FrogBot', appUrl: 'https://www.frogbot.ai', ...cfg }),
} satisfies ProviderDefinition<'openrouter', OpenRouterConfig, OpenRouterProvider>;

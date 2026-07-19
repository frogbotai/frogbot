// Provider definition: Baseten.

import {
  createBaseten,
  type BasetenProvider,
  type BasetenProviderSettings,
} from '@ai-sdk/baseten';

import type { ProviderDefinition } from '../types.js';

export type BasetenConfig = Omit<BasetenProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey: string;
};

export const basetenProvider = {
  name: 'baseten',
  requiredKeys: ['apiKey'],
  envVars: ['BASETEN_API_KEY', 'BASETEN_BASE_URL'],
  fromEnv: (env) => {
    if (!env.BASETEN_API_KEY) return undefined;
    return {
      apiKey: env.BASETEN_API_KEY,
      ...(env.BASETEN_BASE_URL && { baseURL: env.BASETEN_BASE_URL }),
    };
  },
  build: (cfg) => createBaseten(cfg),
} satisfies ProviderDefinition<'baseten', BasetenConfig, BasetenProvider>;

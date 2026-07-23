// Provider definition: DeepInfra.

import {
  createDeepInfra,
  type DeepInfraProvider,
  type DeepInfraProviderSettings,
} from '@ai-sdk/deepinfra';

import type { ProviderDefinition } from '../types.js';

export type DeepInfraConfig = Omit<DeepInfraProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const deepinfraProvider = {
  name: 'deepinfra',
  requiredKeys: ['apiKey'],
  envVars: ['DEEPINFRA_API_KEY', 'DEEPINFRA_BASE_URL'],
  fromEnv: (env) => {
    if (!env.DEEPINFRA_API_KEY) return undefined;
    return {
      apiKey: env.DEEPINFRA_API_KEY,
      ...(env.DEEPINFRA_BASE_URL && { baseURL: env.DEEPINFRA_BASE_URL }),
    };
  },
  build: (cfg) => createDeepInfra(cfg),
} satisfies ProviderDefinition<'deepinfra', DeepInfraConfig, DeepInfraProvider>;

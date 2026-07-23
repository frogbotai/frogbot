// Provider definition: ByteDance (Doubao / Ark).

import {
  createByteDance,
  type ByteDanceProvider,
  type ByteDanceProviderSettings,
} from '@ai-sdk/bytedance';

import type { ProviderDefinition } from '../types.js';

export type ByteDanceConfig = Omit<ByteDanceProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const bytedanceProvider = {
  name: 'bytedance',
  requiredKeys: ['apiKey'],
  envVars: ['ARK_API_KEY', 'ARK_BASE_URL'],
  fromEnv: (env) => {
    if (!env.ARK_API_KEY) return undefined;
    return {
      apiKey: env.ARK_API_KEY,
      ...(env.ARK_BASE_URL && { baseURL: env.ARK_BASE_URL }),
    };
  },
  build: (cfg) => createByteDance(cfg),
} satisfies ProviderDefinition<'bytedance', ByteDanceConfig, ByteDanceProvider>;

// Provider definition: Alibaba (Qwen / DashScope).

import {
  createAlibaba,
  type AlibabaProvider,
  type AlibabaProviderSettings,
} from '@ai-sdk/alibaba';

import type { ProviderDefinition } from '../types.js';

export type AlibabaConfig = Omit<AlibabaProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const alibabaProvider = {
  name: 'alibaba',
  requiredKeys: ['apiKey'],
  envVars: ['ALIBABA_API_KEY', 'ALIBABA_BASE_URL'],
  fromEnv: (env) => {
    if (!env.ALIBABA_API_KEY) return undefined;
    return {
      apiKey: env.ALIBABA_API_KEY,
      ...(env.ALIBABA_BASE_URL && { baseURL: env.ALIBABA_BASE_URL }),
    };
  },
  build: (cfg) => createAlibaba(cfg),
} satisfies ProviderDefinition<'alibaba', AlibabaConfig, AlibabaProvider>;

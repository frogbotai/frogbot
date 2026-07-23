import {
  createAssemblyAI,
  type AssemblyAIProvider,
  type AssemblyAIProviderSettings,
} from '@ai-sdk/assemblyai';

import type { ProviderDefinition } from '../types.js';

export type AssemblyAIConfig = Omit<AssemblyAIProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const assemblyaiProvider = {
  name: 'assemblyai',
  requiredKeys: ['apiKey'],
  envVars: ['ASSEMBLYAI_API_KEY'],
  fromEnv: (env) => {
    if (!env.ASSEMBLYAI_API_KEY) return undefined;
    return { apiKey: env.ASSEMBLYAI_API_KEY };
  },
  build: (cfg) => createAssemblyAI(cfg),
} satisfies ProviderDefinition<'assemblyai', AssemblyAIConfig, AssemblyAIProvider>;

import {
  createTypeSafeAi,
  type TypeSafeAiProvider,
  type TypeSafeAiProviderSettings,
} from '@ai-sdk/typesafe-ai';

import type { ProviderDefinition } from '../types.js';

export type TypeSafeAiConfig = Omit<TypeSafeAiProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const typeSafeAiProvider = {
  name: 'typesafe-ai',
  requiredKeys: ['apiKey'],
  envVars: ['TYPESAFE_AI_API_KEY'],
  fromEnv: (env) => {
    if (!env.TYPESAFE_AI_API_KEY) return undefined;

    return { apiKey: env.TYPESAFE_AI_API_KEY };
  },
  build: (cfg) => createTypeSafeAi(cfg),
} satisfies ProviderDefinition<'typesafe-ai', TypeSafeAiConfig, TypeSafeAiProvider>;

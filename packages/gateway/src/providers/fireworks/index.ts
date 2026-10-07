import {
  createFireworks,
  type FireworksProvider,
  type FireworksProviderSettings,
} from '@ai-sdk/fireworks';

import type { ProviderDefinition } from '../types.js';

export type FireworksConfig = Omit<FireworksProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const fireworksProvider = {
  name: 'fireworks',
  credentials: [{ apiKey: 'FIREWORKS_API_KEY' }],
  envVars: ['FIREWORKS_API_KEY', 'FIREWORKS_BASE_URL'],
  fromEnv: (env) => {
    if (!env.FIREWORKS_API_KEY) return undefined;

    return {
      apiKey: env.FIREWORKS_API_KEY,
      ...(env.FIREWORKS_BASE_URL && { baseURL: env.FIREWORKS_BASE_URL }),
    };
  },
  build: (cfg) => createFireworks(cfg),
} satisfies ProviderDefinition<'fireworks', FireworksConfig, FireworksProvider>;

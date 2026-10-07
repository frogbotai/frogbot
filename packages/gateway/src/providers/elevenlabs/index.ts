import {
  createElevenLabs,
  type ElevenLabsProvider,
  type ElevenLabsProviderSettings,
} from '@ai-sdk/elevenlabs';

import type { ProviderDefinition } from '../types.js';

export type ElevenLabsConfig = Omit<ElevenLabsProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const elevenlabsProvider = {
  name: 'elevenlabs',
  credentials: [{ apiKey: 'ELEVENLABS_API_KEY' }],
  envVars: ['ELEVENLABS_API_KEY'],
  fromEnv: (env) => {
    if (!env.ELEVENLABS_API_KEY) return undefined;

    return { apiKey: env.ELEVENLABS_API_KEY };
  },
  build: (cfg) => createElevenLabs(cfg),
} satisfies ProviderDefinition<'elevenlabs', ElevenLabsConfig, ElevenLabsProvider>;

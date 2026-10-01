// Provider definition: Anthropic.

import {
  type AnthropicProvider,
  type AnthropicProviderSettings,
  createAnthropic,
} from '@ai-sdk/anthropic';

import type { ProviderDefinition } from '../types.js';

/**
 * Gateway config for the Anthropic provider. Same shape as `AnthropicProviderSettings`
 * from `@ai-sdk/anthropic`, with `fetch` excluded.
 */
export type AnthropicConfig = Omit<AnthropicProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const anthropicProvider = {
  name: 'anthropic',
  credentials: [{ apiKey: 'ANTHROPIC_API_KEY' }, { authToken: null }] as const,
  envVars: ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL'],
  fromEnv: (env) => {
    if (!env.ANTHROPIC_API_KEY) return undefined;
    return {
      apiKey: env.ANTHROPIC_API_KEY,
      ...(env.ANTHROPIC_BASE_URL && { baseURL: env.ANTHROPIC_BASE_URL }),
    };
  },
  build: (cfg) => createAnthropic(cfg),
} satisfies ProviderDefinition<'anthropic', AnthropicConfig, AnthropicProvider>;

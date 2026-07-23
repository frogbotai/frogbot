// Provider definition: Anthropic.

import {
  createAnthropic,
  type AnthropicProvider,
  type AnthropicProviderSettings,
} from '@ai-sdk/anthropic';

import type { ProviderDefinition } from '../types.js';

/**
 * Gateway config for the Anthropic provider. Same shape as `AnthropicProviderSettings`
 * from `@ai-sdk/anthropic`, but with `apiKey` required and `fetch` excluded.
 */
export type AnthropicConfig = Omit<AnthropicProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey?: string;
};

export const anthropicProvider = {
  name: 'anthropic',
  requiredKeys: ['apiKey'],
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

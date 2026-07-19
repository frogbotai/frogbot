// Provider definition: OpenAI.
//
// Sources the config type directly from `@ai-sdk/openai`'s exported
// `OpenAIProviderSettings`, requiring `apiKey` (the SDK makes it optional,
// falling back to env — we require it explicitly at the gateway boundary).

import { createOpenAI, type OpenAIProvider, type OpenAIProviderSettings } from '@ai-sdk/openai';

import type { ProviderDefinition } from '../types.js';

/**
 * Gateway config for the OpenAI provider. Same shape as `OpenAIProviderSettings`
 * from `@ai-sdk/openai`, but with `apiKey` required and `fetch` excluded
 * (custom fetch is an escape hatch via pre-built provider instances, not config).
 */
export type OpenAIConfig = Omit<OpenAIProviderSettings, 'apiKey' | 'fetch'> & {
  apiKey: string;
};

export const openaiProvider = {
  name: 'openai',
  requiredKeys: ['apiKey'],
  /**
   * Env vars this provider reads. First entry is the credential gate — its
   * presence enables the provider. Remaining entries are optional overrides.
   * Listed for documentation / `--help` output; `fromEnv` below is the
   * load-bearing consumer.
   */
  envVars: ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_ORGANIZATION', 'OPENAI_PROJECT'],
  /**
   * Build a config from environment variables. Returns `undefined` when the
   * primary credential is missing — that signals the CLI to skip this
   * provider rather than throw.
   */
  fromEnv: (env) => {
    if (!env.OPENAI_API_KEY) return undefined;
    return {
      apiKey: env.OPENAI_API_KEY,
      ...(env.OPENAI_BASE_URL && { baseURL: env.OPENAI_BASE_URL }),
      ...(env.OPENAI_ORGANIZATION && { organization: env.OPENAI_ORGANIZATION }),
      ...(env.OPENAI_PROJECT && { project: env.OPENAI_PROJECT }),
    };
  },
  build: (cfg) => createOpenAI(cfg),
} satisfies ProviderDefinition<'openai', OpenAIConfig, OpenAIProvider>;

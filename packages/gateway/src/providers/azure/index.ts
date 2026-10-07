import {
  type AzureOpenAIProvider,
  type AzureOpenAIProviderSettings,
  createAzure,
} from '@ai-sdk/azure';

import type { ProviderDefinition } from '../types.js';

export type AzureConfig = Omit<AzureOpenAIProviderSettings, 'fetch'>;

export const azureProvider = {
  name: 'azure',
  envVars: ['AZURE_API_KEY', 'AZURE_RESOURCE_NAME', 'AZURE_OPENAI_BASE_URL', 'AZURE_API_VERSION'],
  fromEnv: (env) => {
    const apiKey = env.AZURE_API_KEY;

    if (!apiKey) return undefined;

    const resourceName = env.AZURE_RESOURCE_NAME;
    const baseURL = env.AZURE_OPENAI_BASE_URL;

    if (!resourceName && !baseURL) return undefined;

    return {
      apiKey,
      ...(resourceName && { resourceName }),
      ...(baseURL && { baseURL }),
      ...(env.AZURE_API_VERSION && { apiVersion: env.AZURE_API_VERSION }),
    };
  },
  build: (cfg) => createAzure(cfg),
} satisfies ProviderDefinition<'azure', AzureConfig, AzureOpenAIProvider>;

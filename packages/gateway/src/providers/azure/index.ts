// Provider definition: Azure OpenAI.
//
// Auth: `AZURE_API_KEY` + `AZURE_RESOURCE_NAME` (or `AZURE_OPENAI_BASE_URL`).
// Optional: `AZURE_API_VERSION`, `AZURE_DEPLOYMENT_NAME`.
//
// An API key without a resource name or base URL skips the provider — per the
// `fromEnv` contract, discovery never throws (G41).
//
// Model IDs are deployment names (e.g. `azure/my-gpt4o-deployment`).

import {
  createAzure,
  type AzureOpenAIProvider,
  type AzureOpenAIProviderSettings,
} from '@ai-sdk/azure';

import type { ProviderDefinition } from '../types.js';

export type AzureConfig = Omit<AzureOpenAIProviderSettings, 'fetch'>;

export const azureProvider = {
  name: 'azure',
  envVars: [
    'AZURE_API_KEY',
    'AZURE_RESOURCE_NAME',
    'AZURE_OPENAI_BASE_URL',
    'AZURE_API_VERSION',
  ],
  fromEnv: (env) => {
    const apiKey = env.AZURE_API_KEY;

    // No API key — skip provider.
    if (!apiKey) return undefined;

    const resourceName = env.AZURE_RESOURCE_NAME;
    const baseURL = env.AZURE_OPENAI_BASE_URL;

    // Key without a resource name or base URL cannot build a client — skip
    // provider. Discovery never throws (G41).
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

// Azure provider credential validation tests.

import { describe, expect, it } from 'vitest';

import { azureProvider } from './index.js';

describe('azureProvider.fromEnv', () => {
  it('returns undefined when no Azure credentials are present', () => {
    const result = azureProvider.fromEnv({});
    expect(result).toBeUndefined();
  });

  it('returns undefined when only API key is missing', () => {
    const result = azureProvider.fromEnv({
      AZURE_RESOURCE_NAME: 'my-resource',
    });
    // No API key means skip
    expect(result).toBeUndefined();
  });

  it('returns config with resource name', () => {
    const result = azureProvider.fromEnv({
      AZURE_API_KEY: 'key-123',
      AZURE_RESOURCE_NAME: 'my-resource',
    });
    expect(result).toEqual({
      apiKey: 'key-123',
      resourceName: 'my-resource',
    });
  });

  it('returns config with base URL', () => {
    const result = azureProvider.fromEnv({
      AZURE_API_KEY: 'key-123',
      AZURE_OPENAI_BASE_URL: 'https://my-resource.openai.azure.com',
    });
    expect(result).toEqual({
      apiKey: 'key-123',
      baseURL: 'https://my-resource.openai.azure.com',
    });
  });

  it('includes apiVersion when AZURE_API_VERSION is set', () => {
    const result = azureProvider.fromEnv({
      AZURE_API_KEY: 'key-123',
      AZURE_RESOURCE_NAME: 'my-resource',
      AZURE_API_VERSION: '2024-06-01',
    });
    expect(result).toEqual({
      apiKey: 'key-123',
      resourceName: 'my-resource',
      apiVersion: '2024-06-01',
    });
  });

  it('returns undefined when API key set but no resource/baseURL (partial env skips — G41)', () => {
    expect(azureProvider.fromEnv({ AZURE_API_KEY: 'key-123' })).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';

import { buildOpenAICompatibleProvider } from './index.js';

describe('buildOpenAICompatibleProvider', () => {
  it('builds a provider instance exposing languageModel()', () => {
    const provider = buildOpenAICompatibleProvider('ollama', {
      baseURL: 'http://localhost:11434/v1',
    });
    expect(typeof provider.languageModel).toBe('function');
    const model = provider.languageModel('llama3.2');
    expect(model.modelId).toBe('llama3.2');
  });

  it('supports apiKey + headers passthrough', () => {
    const provider = buildOpenAICompatibleProvider('custom', {
      baseURL: 'https://example.com/v1',
      apiKey: 'secret',
      headers: { 'x-custom': '1' },
    });
    expect(provider.languageModel('some-model').modelId).toBe('some-model');
  });
});

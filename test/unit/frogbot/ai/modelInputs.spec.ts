import { describe, expect, it } from 'vitest';

import { resolveModelInputs } from '../../../../packages/frogbot/src/ai/modelInputs.js';
import type { SanitizedAIConfig } from '../../../../packages/frogbot/src/ai/types.js';

const config = {
  providers: {
    anthropic: true,
    bedrock: true,
    openai: true,
    openrouter: true,
    local: {
      type: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      models: [
        {
          id: 'viewer',
          mode: 'chat',
          modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
        },
        { id: 'text-only', mode: 'chat', modalities: { input: ['text'], output: ['text'] } },
        { id: 'plain', mode: 'chat' },
      ],
    },
  },
  routers: { smart: { model: 'anthropic/claude-sonnet-4-5' } },
} as unknown as SanitizedAIConfig;

describe('resolveModelInputs', () => {
  it('reads PDF input from the catalog for a built-in model that lists it', () => {
    expect(resolveModelInputs({ config, model: 'anthropic/claude-sonnet-4-5' })).toEqual({
      inputs: ['text', 'image', 'pdf'],
      provider: 'anthropic',
    });
  });

  it('leaves PDF out for a built-in model whose catalog entry does not list it', () => {
    expect(resolveModelInputs({ config, model: 'openai/gpt-5' })).toEqual({
      inputs: ['text', 'image'],
      provider: 'openai',
    });
  });

  it('resolves a router to its target model', () => {
    expect(resolveModelInputs({ config, model: 'smart' })).toEqual({
      inputs: ['text', 'image', 'pdf'],
      provider: 'anthropic',
    });
  });

  it('resolves a provider alias to its canonical catalog entry', () => {
    expect(resolveModelInputs({ config, model: 'bedrock/nova-pro' })).toEqual({
      inputs: ['text', 'image', 'video', 'pdf'],
      provider: 'bedrock',
    });
  });

  it('uses the catalog entry of the aggregator route', () => {
    expect(resolveModelInputs({ config, model: 'openrouter/openai/gpt-5' })).toEqual({
      inputs: ['text', 'image', 'pdf'],
      provider: 'openrouter',
    });
  });

  it.each([
    ['local/viewer', ['text', 'image', 'pdf']],
    ['local/text-only', ['text']],
  ])('reads the declared input types of custom model %s', (model, inputs) => {
    expect(resolveModelInputs({ config, model })).toEqual({ inputs, provider: 'local' });
  });

  it.each([
    ['local/plain', 'local'],
    ['local/undeclared', 'local'],
    ['openai/unknown', 'openai'],
  ])('reports unknown input types for %s', (model, provider) => {
    expect(resolveModelInputs({ config, model })).toEqual({ provider });
  });

  it('reports unknown input types and no provider for an unresolvable model', () => {
    expect(resolveModelInputs({ config, model: 'fast' })).toEqual({ provider: '' });
  });
});

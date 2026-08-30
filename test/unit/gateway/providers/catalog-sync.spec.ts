import { describe, expect, it } from 'vitest';

import { buildCatalogs } from '../../../../scripts/sync-catalog.mjs';

const model = {
  id: 'openai.gpt-5.6-luna',
  name: 'GPT 5.6 Luna',
  modalities: { input: ['text'], output: ['text'] },
  limit: { context: 128_000, output: 16_384 },
};

describe('catalog sync SDK metadata', () => {
  it('preserves per-model provider routing metadata', () => {
    const { gateway } = buildCatalogs({
      overlays: {},
      source: {
        'amazon-bedrock': {
          models: {
            [model.id]: {
              ...model,
              provider: {
                npm: '@ai-sdk/amazon-bedrock/mantle',
                api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/openai/v1',
                shape: 'responses',
              },
            },
          },
        },
      },
    });

    expect(gateway[0]).toHaveProperty('sdk', {
      npm: '@ai-sdk/amazon-bedrock/mantle',
      api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/openai/v1',
      shape: 'responses',
    });
  });

  it('omits SDK metadata when the source has no provider override', () => {
    const { gateway } = buildCatalogs({
      overlays: {},
      source: { 'amazon-bedrock': { models: { [model.id]: model } } },
    });

    expect(gateway[0]).not.toHaveProperty('sdk');
  });

  it('supplements and excludes models for synced providers', () => {
    const replacement = { ...model, id: `global.${model.id}` };
    const { gateway } = buildCatalogs({
      overlays: {
        bedrock: {
          add: [
            {
              ...replacement,
              id: `bedrock/${replacement.id}`,
              mode: 'chat',
              operations: ['chat.completions'],
              capabilities: {},
              context: { input: 128_000, output: 16_384 },
              providers: ['bedrock'],
            },
          ],
          exclude: [model.id],
        },
      },
      source: { 'amazon-bedrock': { models: { [model.id]: model } } },
    });

    expect(gateway.map(({ id }) => id)).toEqual([`bedrock/${replacement.id}`]);
  });

  it('preserves overlay-only provider entries', () => {
    const { gateway } = buildCatalogs({
      overlays: {
        voyage: {
          add: [
            {
              id: 'voyage/voyage-3',
              mode: 'embedding',
              name: 'Voyage 3',
              modalities: { input: ['text'], output: ['embedding'] },
              operations: ['embeddings'],
              capabilities: {},
              context: { input: 32_000, output: 1_024 },
              providers: ['voyage'],
            },
          ],
          exclude: [],
        },
      },
      source: {},
    });

    expect(gateway).toEqual([
      {
        id: 'voyage/voyage-3',
        name: 'Voyage 3',
        modalities: { input: ['text'], output: ['embedding'] },
        operations: ['embeddings'],
        capabilities: {},
        context: { input: 32_000, output: 1_024 },
        providers: ['voyage'],
      },
    ]);
  });

  it('uses the overlay entry when a synced provider adds the same ID', () => {
    const { gateway } = buildCatalogs({
      overlays: {
        bedrock: {
          add: [
            {
              id: `bedrock/${model.id}`,
              mode: 'chat',
              name: 'Reviewed profile metadata',
              modalities: model.modalities,
              operations: ['chat.completions'],
              capabilities: {},
              context: { input: 128_000, output: 16_384 },
              providers: ['bedrock'],
            },
          ],
          exclude: [],
        },
      },
      source: { 'amazon-bedrock': { models: { [model.id]: model } } },
    });

    expect(gateway).toHaveLength(1);
    expect(gateway[0]?.name).toBe('Reviewed profile metadata');
  });
});

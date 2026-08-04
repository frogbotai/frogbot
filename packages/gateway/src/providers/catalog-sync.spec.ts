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
      overlays: [],
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
      overlays: [],
      source: { 'amazon-bedrock': { models: { [model.id]: model } } },
    });

    expect(gateway[0]).not.toHaveProperty('sdk');
  });
});

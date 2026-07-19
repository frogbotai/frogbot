import { describe, expect, it } from 'vitest';

import { toEmbedParams } from './toEmbedParams.js';

describe('toEmbedParams', () => {
  it('maps a single input string', () => {
    expect(toEmbedParams({ model: 'openai/text-embedding-3-large', input: 'hello' })).toEqual({
      values: ['hello'],
      providerOptions: {},
    });
  });

  it('stages dimensions and user in the neutral namespace for per-provider re-homing', () => {
    expect(toEmbedParams({
      model: 'openai/text-embedding-3-large',
      input: ['a', 'b'],
      dimensions: 256,
      encoding_format: 'base64',
      user: 'user-1',
    })).toEqual({
      values: ['a', 'b'],
      providerOptions: {
        unknown: {
          dimensions: 256,
          user: 'user-1',
        },
      },
    });
  });

  it('maps OpenAI token-array inputs', () => {
    expect(toEmbedParams({
      model: 'openai/text-embedding-3-large',
      input: [101, 102],
    })).toEqual({
      values: [[101, 102]],
      providerOptions: {},
    });

    expect(toEmbedParams({
      model: 'openai/text-embedding-3-large',
      input: [[101], [102]],
    })).toEqual({
      values: [[101], [102]],
      providerOptions: {},
    });
  });
});

import { describe, expect, it } from 'vitest';

import { toGenerateImageParams } from './toGenerateImageParams.js';

describe('toGenerateImageParams', () => {
  it('maps OpenAI image generation fields to AI SDK params', () => {
    expect(toGenerateImageParams({
      body: {
        model: 'openai/dall-e-3',
        prompt: 'a frog robot',
        n: 2,
        size: '1024x1024',
        quality: 'hd',
        style: 'vivid',
        response_format: 'b64_json',
        user: 'user-1',
      },
      providerName: 'openai',
    })).toEqual({
      prompt: 'a frog robot',
      n: 2,
      size: '1024x1024',
      providerOptions: {
        openai: {
          quality: 'hd',
          style: 'vivid',
          user: 'user-1',
        },
      },
    });
  });

  it.each([
    ['openai', 'openai'],
    ['replicate', 'replicate'],
    ['fal', 'fal'],
    ['luma', 'luma'],
    ['black-forest-labs', 'blackForestLabs'],
  ])('scopes image provider options for %s', (providerName, providerOptionsKey) => {
    expect(toGenerateImageParams({
      body: {
        model: `${providerName}/image-model`,
        prompt: 'a frog robot',
        quality: 'hd',
        style: 'vivid',
        user: 'user-1',
      },
      providerName,
    }).providerOptions).toEqual({
      [providerOptionsKey]: {
        quality: 'hd',
        style: 'vivid',
        user: 'user-1',
      },
    });
  });
});

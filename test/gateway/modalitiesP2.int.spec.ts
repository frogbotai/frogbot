import type { ImageModelV4, ImageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

function createMockImageModel(opts?: {
  onCall?: (options: ImageModelV4CallOptions) => void;
}): ImageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-image-model',
    maxImagesPerCall: undefined,
    doGenerate: (options: ImageModelV4CallOptions) => {
      opts?.onCall?.(options);

      return Promise.resolve({
        images: [Buffer.from('fake-image').toString('base64')],
        warnings: [],
        response: {
          timestamp: new Date('2026-01-01T00:00:00Z'),
          modelId: 'mock-image-model',
          headers: {},
        },
        usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 },
      });
    },
  };
}

function makeImageApp(imageModel?: ImageModelV4) {
  const fakeProvider = {
    imageModel: () => imageModel ?? createMockImageModel(),
    languageModel: () => {
      throw new Error('not used');
    },
    embeddingModel: () => {
      throw new Error('not used');
    },
  };

  const registry = { openai: fakeProvider } as unknown as ProviderRegistry;

  return createApp({ registry });
}

describe('G77 — images: size:auto rejected; usage missing from response', () => {
  it('POST /v1/images/generations with size:"auto" returns 200, not 400', async () => {
    const app = makeImageApp();
    const { status } = await postJson(app, '/v1/images/generations', {
      model: 'openai/gpt-image-1',
      prompt: 'a cat',
      size: 'auto',
    });

    expect(status).not.toBe(400);
    expect(status).toBe(200);
  });

  it('POST /v1/images/generations response includes usage field', async () => {
    const app = makeImageApp(createMockImageModel());
    const { status, body } = await postJson(app, '/v1/images/generations', {
      model: 'openai/gpt-image-1',
      prompt: 'a cat',
      size: '1024x1024',
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty('usage');
  });
});

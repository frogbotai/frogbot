import { TooManyEmbeddingValuesForCallError } from '@ai-sdk/provider';
import { MockEmbeddingModelV4, MockProviderV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import type { ProviderRegistry } from '../../providers/registry.js';

describe('embeddingsRoute', () => {
  it('serves POST /v1/embeddings', async () => {
    const model = new MockEmbeddingModelV4({
      maxEmbeddingsPerCall: 2,
      doEmbed: async ({ values }) => ({
        embeddings: values.map((_, index) => [index + 1, index + 2]),
        usage: { tokens: 7 },
        warnings: [],
      }),
    });
    const app = createApp({
      registry: {
        openai: new MockProviderV4({ embeddingModels: { 'text-embedding-3-small': model } }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/embeddings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/text-embedding-3-small',
        input: ['a', 'b'],
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      object: 'list',
      data: [
        { object: 'embedding', embedding: [1, 2], index: 0 },
        { object: 'embedding', embedding: [2, 3], index: 1 },
      ],
      usage: { prompt_tokens: 7, total_tokens: 7 },
    });
  });

  it('accepts token-array inputs and guards non-finite usage tokens', async () => {
    const model = new MockEmbeddingModelV4({
      maxEmbeddingsPerCall: 2,
      doEmbed: async ({ values }) => ({
        embeddings: values.map((_, index) => [index + 1]),
        usage: { tokens: Number.NaN },
        warnings: [],
      }),
    });
    const app = createApp({
      registry: {
        openai: new MockProviderV4({ embeddingModels: { 'text-embedding-3-small': model } }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/embeddings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/text-embedding-3-small',
        input: [[101, 102], [103]],
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: [
        { embedding: [1], index: 0 },
        { embedding: [2], index: 1 },
      ],
      usage: { prompt_tokens: 0, total_tokens: 0 },
    });
    expect(model.doEmbedCalls[0]?.values).toEqual([[101, 102], [103]]);
  });

  it('rejects empty strings and caps batch inputs at 2048', async () => {
    const app = createApp({
      registry: {
        openai: new MockProviderV4({ embeddingModels: { 'text-embedding-3-small': new MockEmbeddingModelV4() } }),
      } as unknown as ProviderRegistry,
    });

    const emptyStringRes = await app.request('/v1/embeddings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/text-embedding-3-small', input: '' }),
    });
    expect(emptyStringRes.status).toBe(400);
    expect(await emptyStringRes.json()).toHaveProperty('error.param', 'input');

    const oversizedRes = await app.request('/v1/embeddings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/text-embedding-3-small',
        input: Array.from({ length: 2049 }, () => 'frog'),
      }),
    });
    expect(oversizedRes.status).toBe(400);
    expect(await oversizedRes.json()).toHaveProperty('error.param', 'input');
  });

  it('returns OpenAI-shaped 400 for too many embedding values', async () => {
    const model = new MockEmbeddingModelV4({
      maxEmbeddingsPerCall: 2,
      doEmbed: async ({ values }) => {
        throw new TooManyEmbeddingValuesForCallError({
          provider: 'openai',
          modelId: 'text-embedding-3-small',
          maxEmbeddingsPerCall: 2,
          values,
        });
      },
    });
    const app = createApp({
      registry: {
        openai: new MockProviderV4({ embeddingModels: { 'text-embedding-3-small': model } }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/embeddings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/text-embedding-3-small',
        input: ['a', 'b', 'c'],
      }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: {
        type: 'invalid_request_error',
        code: 'too_many_embedding_values',
        param: 'input',
      },
    });
  });
});

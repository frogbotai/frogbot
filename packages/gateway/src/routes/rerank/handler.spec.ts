import { MockProviderV4, MockRerankingModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';
import type { ProviderRegistry } from '../../providers/registry.js';

describe('rerankRoute', () => {
  it('serves POST /v1/rerank', async () => {
    const doRerank = vi.fn(async () => ({
      ranking: [
        { index: 1, relevanceScore: 0.9 },
        { index: 0, relevanceScore: 0.5 },
      ],
      warnings: [],
      response: {
        id: 'rerank_123',
        body: { meta: { billed_units: { search_units: 1 } } },
      },
    }));
    const model = new MockRerankingModelV4({ doRerank });
    const app = createApp({
      registry: {
        cohere: new MockProviderV4({ rerankingModels: { 'rerank-v3.5': model } }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/rerank', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'cohere/rerank-v3.5',
        query: 'frog robot',
        documents: ['frog', 'robot'],
        top_n: 2,
        return_documents: true,
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: 'rerank_123',
      results: [
        { index: 1, relevance_score: 0.9, document: { text: 'robot' } },
        { index: 0, relevance_score: 0.5, document: { text: 'frog' } },
      ],
      meta: { billed_units: { search_units: 1 } },
    });
    expect(doRerank).toHaveBeenCalledWith(expect.objectContaining({
      query: 'frog robot',
      documents: { type: 'text', values: ['frog', 'robot'] },
      topN: 2,
    }));
  });

  it('rejects mixed document types', async () => {
    const app = createApp({
      registry: {
        cohere: new MockProviderV4({ rerankingModels: { 'rerank-v3.5': new MockRerankingModelV4() } }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/rerank', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'cohere/rerank-v3.5',
        query: 'frog robot',
        documents: ['frog', { text: 'robot' }],
      }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty('error.param', 'documents');
  });

  it('returns typed 400 for invalid requests', async () => {
    const app = createApp({
      registry: {
        voyage: new MockProviderV4({
          rerankingModels: { 'rerank-2.5': new MockRerankingModelV4() },
        }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/rerank', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'voyage/rerank-2.5',
        query: 'frog robot',
        documents: [],
      }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: {
        param: 'documents',
      },
    });
  });
});

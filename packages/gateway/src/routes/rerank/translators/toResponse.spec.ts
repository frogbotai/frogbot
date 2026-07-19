import { describe, expect, it } from 'vitest';
import type { RerankResult } from 'ai';

import { toOpenAIRerankResponse } from './toResponse.js';

describe('toOpenAIRerankResponse', () => {
  it('maps rankings with optional documents', () => {
    const result = {
      ranking: [
        { originalIndex: 1, score: 0.91, document: 'robot' },
        { originalIndex: 0, score: 0.42, document: 'frog' },
      ],
      response: { id: 'rerank_123' },
    } as RerankResult<string>;

    expect(toOpenAIRerankResponse(result, { returnDocuments: true, requestId: 'req_123' })).toEqual({
      id: 'rerank_123',
      results: [
        { index: 1, relevance_score: 0.91, document: { text: 'robot' } },
        { index: 0, relevance_score: 0.42, document: { text: 'frog' } },
      ],
      meta: {},
    });
  });

  it('omits documents by default and falls back to request ID', () => {
    const result = {
      ranking: [{ originalIndex: 0, score: 0.5, document: 'frog' }],
      response: {},
    } as RerankResult<string>;

    expect(toOpenAIRerankResponse(result, { returnDocuments: false, requestId: 'req_123' })).toEqual({
      id: 'req_123',
      results: [{ index: 0, relevance_score: 0.5 }],
      meta: {},
    });
  });

  it('maps Cohere response metadata', () => {
    const result = {
      ranking: [{ originalIndex: 0, score: 0.5, document: 'frog' }],
      response: {
        body: { meta: { billed_units: { search_units: 1 } } },
      },
    } as RerankResult<string>;

    expect(toOpenAIRerankResponse(result, { returnDocuments: false, requestId: 'req_123' }).meta).toEqual({
      billed_units: { search_units: 1 },
    });
  });
});

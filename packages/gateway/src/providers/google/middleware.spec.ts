import { describe, expect, it } from 'vitest';

import { googleEmbedDimensions } from './middleware.js';

describe('googleEmbedDimensions', () => {
  it('maps neutral dimensions to Google outputDimensionality for embeddings', () => {
    const providerOptions: Record<string, Record<string, unknown>> = { unknown: { dimensions: 256 } };

    googleEmbedDimensions({
      phase: 'beforeUpstream',
      operation: 'embeddings',
      requestId: 'req_123',
      startedAt: Date.now(),
      context: {},
      otel: {},
      model: 'google/text-embedding-004',
      provider: 'google',
      messages: [],
      params: {},
      headers: new Headers(),
      providerOptions,
    });

    expect(providerOptions.google).toEqual({ outputDimensionality: 256 });
    expect(providerOptions.unknown).toEqual({});
  });
});

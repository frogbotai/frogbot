import { describe, expect, it, vi } from 'vitest';

import { encodeEmbedding, toOpenAIEmbeddingsResponse } from './toOpenAIResponse.js';

describe('toOpenAIEmbeddingsResponse', () => {
  it('maps float embeddings', () => {
    expect(toOpenAIEmbeddingsResponse({
      embeddings: [[1, 2], [3, 4]],
      model: 'openai/text-embedding-3-small',
      promptTokens: 3,
    })).toEqual({
      object: 'list',
      data: [
        { object: 'embedding', embedding: [1, 2], index: 0 },
        { object: 'embedding', embedding: [3, 4], index: 1 },
      ],
      model: 'openai/text-embedding-3-small',
      usage: { prompt_tokens: 3, total_tokens: 3 },
    });
  });

  it('encodes base64 as little-endian Float32 bytes', () => {
    const encoded = encodeEmbedding([1, -2.5]);
    expect(encoded).toBe(Buffer.from(new Uint8Array([0, 0, 128, 63, 0, 0, 32, 192])).toString('base64'));
  });

  it('encodes base64 without Buffer for workers runtimes', () => {
    vi.stubGlobal('Buffer', undefined);
    try {
      expect(encodeEmbedding([1, -2.5])).toBe('AACAPwAAIMA=');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

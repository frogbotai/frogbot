// Modalities P2 findings — G77 (+ G79 note).
//
// G77: CONFIRMED — Images: size:"auto" rejected at schema; usage missing from response
// G79: DEFERRED — Videos: sync endpoint design vs OpenAI async API (policy decision)
//
// G76 (transcriptions stream) and G78 (speech Content-Type) live in the
// COLOCATED unit spec packages/gateway/src/routes/modalitiesStreamMime.spec.ts
// because they require `ai/test` provider mocks, which only resolve in the
// vitest `unit` project (not `int`).

import { describe, expect, it } from 'vitest';
import type { ImageModelV4, ImageModelV4CallOptions } from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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
        response: { timestamp: new Date('2026-01-01T00:00:00Z'), modelId: 'mock-image-model', headers: {} },
        usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 },
      });
    },
  };
}

function makeImageApp(imageModel?: ImageModelV4) {
  const fakeProvider = {
    imageModel: () => imageModel ?? createMockImageModel(),
    languageModel: () => { throw new Error('not used'); },
    embeddingModel: () => { throw new Error('not used'); },
  };
  const registry = { openai: fakeProvider } as unknown as ProviderRegistry;
  return createApp({ registry });
}

// ---------------------------------------------------------------------------
// G77 — Images: size:"auto" rejected at schema; usage missing from response
//
// The images schema uses z.string().regex(/^\d+x\d+$/) which rejects "auto".
// gpt-image-1 accepts size:"auto". Also the image response omits the `usage`
// field that OpenAI's API returns for gpt-image-1.
// ---------------------------------------------------------------------------

describe('G77 — images: size:auto rejected; usage missing from response', () => {
  it(
    // G77: size:"auto" rejected by schema regex /^\d+x\d+$/
    'POST /v1/images/generations with size:"auto" returns 200, not 400',
    async () => {
      const app = makeImageApp();
      const { status } = await postJson(app, '/v1/images/generations', {
        model: 'openai/gpt-image-1',
        prompt: 'a cat',
        size: 'auto',
      });

      // "auto" is a valid gpt-image-1 size; schema regex rejects it with 400
      expect(status).not.toBe(400);
      expect(status).toBe(200);
    },
  );

  it(
    // G77: response from /v1/images/generations is missing usage field
    'POST /v1/images/generations response includes usage field',
    async () => {
      const app = makeImageApp(createMockImageModel());
      const { status, body } = await postJson(app, '/v1/images/generations', {
        model: 'openai/gpt-image-1',
        prompt: 'a cat',
        size: '1024x1024',
      });

      expect(status).toBe(200);
      // OpenAI images response includes usage for gpt-image-1 token-based billing;
      // gateway currently strips usage from toOpenAIImagesResponse
      expect(body).toHaveProperty('usage');
    },
  );
});

// Embeddings `dimensions` staged under the wrong provider namespace.
//
// G24 (MD2): embeddings/translators/toEmbedParams.ts:11-17 unconditionally
// stages `dimensions`/`user` under `providerOptions.openai`, regardless of the
// resolved provider. Only openai + google middleware translate that namespace;
// cohere/voyage/bedrock/vertex have NO mapping, so a `dimensions` request
// routed to one of those providers is silently dropped and the client gets a
// full-width vector instead of the requested truncated width.
//
// MOCK tier — no live angle: Zen's free catalog has no embeddings model, and
// the bug is provider-specific to non-openai/google embedding providers. It is
// proven at the provider seam by capturing the providerOptions the resolved
// model's `doEmbed` actually receives.

import { describe, expect, it } from 'vitest';
import type { EmbeddingModelV4 } from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

type CapturedProviderOptions = Record<string, Record<string, unknown>> | undefined;

/** A mock embedding model that captures the providerOptions it receives. */
function createCapturingEmbeddingModel(capture: (providerOptions: CapturedProviderOptions) => void): EmbeddingModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-embed-model',
    maxEmbeddingsPerCall: undefined,
    supportsParallelCalls: true,
    doEmbed: (options) => {
      capture(options.providerOptions);
      return Promise.resolve({
        embeddings: options.values.map(() => [0.1, 0.2, 0.3]),
        usage: { tokens: 4 },
        response: { headers: {} },
        warnings: [],
      });
    },
  };
}

function makeApp(providerName: string, capture: (providerOptions: CapturedProviderOptions) => void) {
  const fakeProvider = { embeddingModel: () => createCapturingEmbeddingModel(capture) };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;
  return createApp({ registry });
}

describe('gateway integration — embeddings dimensions namespace (G24)', () => {
  // A client asks a cohere model for 256-dim vectors. The correct behavior is
  // that the resolved provider (cohere) actually sees the dimension knob under
  // its own namespace (`providerOptions.cohere.outputDimension`), OR the
  // request is rejected with a typed 400. Today the gateway stages the value
  // under `providerOptions.openai.dimensions`, which cohere ignores, so the
  // client silently receives full-width vectors.
  it('routes a dimensions request to the resolved cohere provider (not the openai namespace)', async () => {
    let captured: CapturedProviderOptions;
    const app = makeApp('cohere', (providerOptions) => { captured = providerOptions; });

    const { status } = await postJson(app, '/v1/embeddings', {
      model: 'cohere/embed-english-v3.0',
      input: 'hello',
      dimensions: 256,
    });

    expect(status).toBe(200);
    // The dimension knob must reach cohere's own namespace — not be stranded
    // under `openai`, where cohere never reads it.
    expect(captured?.cohere).toMatchObject({ outputDimension: 256 });
    expect(captured?.openai).toBeUndefined();
  });
});

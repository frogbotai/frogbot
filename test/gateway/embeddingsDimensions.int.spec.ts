import type { EmbeddingModelV4 } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

type CapturedProviderOptions = Record<string, Record<string, unknown>> | undefined;

function createCapturingEmbeddingModel(
  capture: (providerOptions: CapturedProviderOptions) => void,
): EmbeddingModelV4 {
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

function makeApp(
  providerName: string,
  capture: (providerOptions: CapturedProviderOptions) => void,
) {
  const fakeProvider = { embeddingModel: () => createCapturingEmbeddingModel(capture) };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;

  return createApp({ registry });
}

describe('gateway integration — embeddings dimensions namespace (G24)', () => {
  it('routes a dimensions request to the resolved cohere provider (not the openai namespace)', async () => {
    let captured: CapturedProviderOptions;
    const app = makeApp('cohere', (providerOptions) => {
      captured = providerOptions;
    });

    const { status } = await postJson(app, '/v1/embeddings', {
      model: 'cohere/embed-english-v3.0',
      input: 'hello',
      dimensions: 256,
    });

    expect(status).toBe(200);
    expect(captured?.cohere).toMatchObject({ outputDimension: 256 });
    expect(captured?.openai).toBeUndefined();
  });
});

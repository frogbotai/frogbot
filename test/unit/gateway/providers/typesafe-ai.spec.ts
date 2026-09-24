import { NoSuchModelError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import {
  ConfigError,
  UnsupportedModalityError,
} from '../../../../packages/gateway/src/errors/gatewayError.js';
import { createGateway } from '../../../../packages/gateway/src/gateway.js';
import { DEFAULT_MODEL_CATALOG } from '../../../../packages/gateway/src/providers/catalog.data.js';
import { calculateModelCostUSD } from '../../../../packages/gateway/src/providers/cost.js';
import {
  buildProviderRegistry,
  requireEvaluationModel,
} from '../../../../packages/gateway/src/providers/registry.js';
import { typeSafeAiProvider } from '../../../../packages/gateway/src/providers/typesafe-ai/index.js';

describe('TypeSafe AI provider', () => {
  it('discovers credentials only when TYPESAFE_AI_API_KEY is set', () => {
    expect(typeSafeAiProvider.envVars).toEqual(['TYPESAFE_AI_API_KEY']);
    expect(typeSafeAiProvider.fromEnv({})).toBeUndefined();
    expect(typeSafeAiProvider.fromEnv({ TYPESAFE_AI_API_KEY: 'secret' })).toEqual({
      apiKey: 'secret',
    });
  });

  it('builds the real SDK evaluation provider with an explicit key', () => {
    const registry = buildProviderRegistry({ 'typesafe-ai': { apiKey: 'secret' } });
    const provider = registry['typesafe-ai'];

    expect(provider).toBeDefined();
    expect(provider?.specificationVersion).toBe('v4');
    expect(provider?.evaluationModel('jev-latest')).toMatchObject({
      modelId: 'jev-latest',
      provider: 'typesafe.evaluation',
      supportedQuestionTypes: ['choice', 'score', 'boolean'],
    });
  });

  it('rejects missing shorthand credentials at gateway construction', () => {
    expect(() => createGateway({ providers: { 'typesafe-ai': {} } })).toThrow(ConfigError);
  });

  it('rejects non-evaluation SDK modalities and missing evaluation capability', () => {
    const provider = typeSafeAiProvider.build({ apiKey: 'secret' });
    const otherProvider = buildProviderRegistry({ openai: { apiKey: 'secret' } }).openai;

    expect(() => provider.languageModel('jev-latest')).toThrow(NoSuchModelError);
    expect(() => provider.embeddingModel('jev-latest')).toThrow(NoSuchModelError);
    expect(() => provider.imageModel('jev-latest')).toThrow(NoSuchModelError);
    expect(() =>
      requireEvaluationModel({
        provider: otherProvider!,
        providerName: 'openai',
        modelName: 'gpt-4o-mini',
      }),
    ).toThrow(UnsupportedModalityError);
  });

  it('prices both requested public IDs from their own catalog entries', () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 10, totalTokens: 1_000_010 };

    expect(DEFAULT_MODEL_CATALOG.get('typesafe-ai/jev')?.operations).toEqual(['evaluate']);
    expect(DEFAULT_MODEL_CATALOG.get('typesafe-ai/jev-latest')?.operations).toEqual(['evaluate']);
    expect(calculateModelCostUSD('typesafe-ai/jev', usage)).toBe(0.042);
    expect(calculateModelCostUSD('typesafe-ai/jev-latest', usage)).toBe(0.042);
  });
});

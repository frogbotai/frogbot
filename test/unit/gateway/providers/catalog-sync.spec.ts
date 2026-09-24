import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import catalog from '../../../../packages/frogbot/src/ai/catalog.json';
import { DEFAULT_MODEL_CATALOG } from '../../../../packages/gateway/src/providers/catalog.data.js';
import {
  calculateCostUSD,
  supportsOperation,
} from '../../../../packages/gateway/src/providers/catalog.js';
import { renderAIModelTypes } from '../../../../scripts/generate-ai-types.mjs';
import overlays from '../../../../scripts/model-catalog-overlays.json';
import { buildCatalogs } from '../../../../scripts/sync-catalog.mjs';

const model = {
  id: 'openai.gpt-5.6-luna',
  name: 'GPT 5.6 Luna',
  modalities: { input: ['text'], output: ['text'] },
  limit: { context: 128_000, output: 16_384 },
};

describe('catalog sync SDK metadata', () => {
  it('preserves per-model provider routing metadata', () => {
    const { gateway } = buildCatalogs({
      overlays: {},
      source: {
        'amazon-bedrock': {
          models: {
            [model.id]: {
              ...model,
              provider: {
                npm: '@ai-sdk/amazon-bedrock/mantle',
                api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/openai/v1',
                shape: 'responses',
              },
            },
          },
        },
      },
    });

    expect(gateway[0]).toHaveProperty('sdk', {
      npm: '@ai-sdk/amazon-bedrock/mantle',
      api: 'https://bedrock-mantle.${AWS_REGION}.api.aws/openai/v1',
      shape: 'responses',
    });
  });

  it('omits SDK metadata when the source has no provider override', () => {
    const { gateway } = buildCatalogs({
      overlays: {},
      source: { 'amazon-bedrock': { models: { [model.id]: model } } },
    });

    expect(gateway[0]).not.toHaveProperty('sdk');
  });

  it('supplements and excludes models for synced providers', () => {
    const replacement = { ...model, id: `global.${model.id}` };
    const { gateway } = buildCatalogs({
      overlays: {
        bedrock: {
          add: [
            {
              ...replacement,
              id: `bedrock/${replacement.id}`,
              mode: 'chat',
              operations: ['chat.completions'],
              capabilities: {},
              context: { input: 128_000, output: 16_384 },
              providers: ['bedrock'],
            },
          ],
          exclude: [model.id],
        },
      },
      source: { 'amazon-bedrock': { models: { [model.id]: model } } },
    });

    expect(gateway.map(({ id }) => id)).toEqual([`bedrock/${replacement.id}`]);
  });

  it('preserves overlay-only provider entries', () => {
    const { gateway } = buildCatalogs({
      overlays: {
        voyage: {
          add: [
            {
              id: 'voyage/voyage-3',
              mode: 'embedding',
              name: 'Voyage 3',
              modalities: { input: ['text'], output: ['embedding'] },
              operations: ['embeddings'],
              capabilities: {},
              context: { input: 32_000, output: 1_024 },
              providers: ['voyage'],
            },
          ],
          exclude: [],
        },
      },
      source: {},
    });

    expect(gateway).toEqual([
      {
        id: 'voyage/voyage-3',
        name: 'Voyage 3',
        modalities: { input: ['text'], output: ['embedding'] },
        operations: ['embeddings'],
        capabilities: {},
        context: { input: 32_000, output: 1_024 },
        providers: ['voyage'],
      },
    ]);
  });

  it('uses the overlay entry when a synced provider adds the same ID', () => {
    const { gateway } = buildCatalogs({
      overlays: {
        bedrock: {
          add: [
            {
              id: `bedrock/${model.id}`,
              mode: 'chat',
              name: 'Reviewed profile metadata',
              modalities: model.modalities,
              operations: ['chat.completions'],
              capabilities: {},
              context: { input: 128_000, output: 16_384 },
              providers: ['bedrock'],
            },
          ],
          exclude: [],
        },
      },
      source: { 'amazon-bedrock': { models: { [model.id]: model } } },
    });

    expect(gateway).toHaveLength(1);
    expect(gateway[0]?.name).toBe('Reviewed profile metadata');
  });

  it('keeps evaluation, rerank and chat modes distinct even with text output', () => {
    const entries = [
      { id: 'typesafe-ai/jev', operations: ['evaluate'], mode: 'chat' },
      { id: 'typesafe-ai/reranker', operations: ['rerank'], mode: 'chat' },
      { id: 'typesafe-ai/conversation', operations: ['chat.completions'], mode: 'evaluate' },
    ];

    const { catalog, gateway } = buildCatalogs({
      overlays: {
        'typesafe-ai': {
          add: entries.map((entry) => ({
            ...entry,
            name: entry.id,
            modalities: { input: ['text'], output: ['text'] },
            capabilities: {},
            context: { input: 64_000, output: 0 },
            providers: ['typesafe-ai'],
          })),
          exclude: [],
        },
      },
      source: {},
    });

    expect(catalog).toEqual([
      { id: 'typesafe-ai/conversation', provider: 'typesafe-ai', mode: 'chat' },
      { id: 'typesafe-ai/jev', provider: 'typesafe-ai', mode: 'evaluate' },
      { id: 'typesafe-ai/reranker', provider: 'typesafe-ai', mode: 'rerank' },
    ]);

    expect(gateway.every((entry) => !Object.hasOwn(entry, 'mode'))).toBe(true);
  });

  it('publishes both TypeSafe evaluation IDs with matching overlay pricing', () => {
    const ids = ['typesafe-ai/jev', 'typesafe-ai/jev-latest'];

    const generated = buildCatalogs({
      overlays: { 'typesafe-ai': overlays['typesafe-ai'] },
      source: {},
    });

    for (const id of ids) {
      const gatewayEntry = DEFAULT_MODEL_CATALOG.get(id);

      expect(gatewayEntry).toEqual(generated.gateway.find((entry) => entry.id === id));
      expect(catalog.find((entry) => entry.id === id)).toEqual(
        generated.catalog.find((entry) => entry.id === id),
      );
      expect(gatewayEntry?.operations).toEqual(['evaluate']);
      expect(gatewayEntry?.modalities).toEqual({ input: ['text'], output: [] });
      expect(gatewayEntry?.context).toEqual({ input: 64_000, output: 0 });
      expect(gatewayEntry?.cost).toEqual({ input: 0.042, output: 0 });
      expect(
        calculateCostUSD({ inputTokens: 1_000_000, outputTokens: 500 }, gatewayEntry?.cost),
      ).toBe(0.042);

      if (gatewayEntry) {
        expect(supportsOperation(gatewayEntry, 'evaluate')).toBe(true);
        expect(supportsOperation(gatewayEntry, 'chat.completions')).toBe(false);
      }
    }
  });

  it('keeps the generated TypeSafe model IDs in sync with the core catalog', async () => {
    const generated = await readFile(
      new URL('../../../../packages/frogbot/src/ai/generated.ts', import.meta.url),
      'utf8',
    );

    expect(generated).toBe(await renderAIModelTypes(catalog));
    expect(generated).toContain("'typesafe-ai/jev' | 'typesafe-ai/jev-latest'");
  });
});

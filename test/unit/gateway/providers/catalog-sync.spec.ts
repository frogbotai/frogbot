import { readFile } from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import catalog from '../../../../packages/frogbot/src/ai/catalog.json';
import { DEFAULT_MODEL_CATALOG } from '../../../../packages/gateway/src/providers/catalog.data.js';
import {
  calculateCostUSD,
  supportsOperation,
} from '../../../../packages/gateway/src/providers/catalog.js';
import overlays from '../../../../scripts/model-catalog-overlays.json';
import { buildCatalogs, renderAIModelTypes } from '../../../../scripts/sync-catalog.mjs';

const model = {
  id: 'openai.gpt-5.6-luna',
  name: 'GPT 5.6 Luna',
  modalities: { input: ['text'], output: ['text'] },
  limit: { context: 128_000, output: 16_384 },
};

describe('catalog sync corrections and modes', () => {
  const id = `openai/${model.id}`;
  const source = { openai: { models: { [model.id]: model } } };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shallowly merges corrections and recomputes the mode', () => {
    const correction = {
      id,
      name: 'Reviewed embedding',
      modalities: { input: ['text'], output: ['embedding'] },
      operations: ['embeddings'],
      capabilities: { reasoning: true },
    };

    const { catalog, gateway } = buildCatalogs({
      overlays: { openai: { correct: [correction] } },
      source,
    });

    expect(catalog).toEqual([{ id, provider: 'openai', mode: 'embedding' }]);
    expect(gateway[0]).toEqual({
      ...correction,
      context: { input: 128_000, output: 16_384 },
      providers: ['openai'],
    });
    expect(gateway[0]).not.toHaveProperty('mode');
  });

  it('defaults all overlay lists to empty', () => {
    const { catalog } = buildCatalogs({ overlays: { openai: {} }, source });

    expect(catalog).toEqual([{ id, provider: 'openai', mode: 'chat' }]);
  });

  it.each([
    ['removed', {}],
    ['renamed', { renamed: { ...model, id: 'renamed' } }],
    ['deprecated', { [model.id]: { ...model, status: 'deprecated' } }],
  ])('rejects a correction for a %s model', (_reason, models) => {
    const sync = () =>
      buildCatalogs({
        overlays: { openai: { correct: [{ id, name: 'Reviewed' }] } },
        source: { openai: { models } },
      });

    expect(sync).toThrow(
      `Model catalog correction '${id}' for provider 'openai' is missing from the synced output`,
    );
  });

  it.each([
    ['unpriced', model],
    [
      'non-text',
      {
        ...model,
        cost: { input: 1, output: 1 },
        modalities: { input: ['text'], output: ['image'] },
      },
    ],
  ])('rejects a correction for a filtered %s aggregator model', (_reason, entry) => {
    const filteredId = `vercel/${model.id}`;
    const sync = () =>
      buildCatalogs({
        overlays: { vercel: { correct: [{ id: filteredId }] } },
        source: { vercel: { models: { [model.id]: entry } } },
      });

    expect(sync).toThrow(
      `Model catalog correction '${filteredId}' for provider 'vercel' is missing from the synced output`,
    );
  });

  it('rejects a mismatched correction provider prefix', () => {
    const sync = () =>
      buildCatalogs({
        overlays: { google: { correct: [{ id }] } },
        source,
      });

    expect(sync).toThrow(
      `Model catalog correction '${id}' for provider 'google' has a mismatched provider prefix`,
    );
  });

  it.each(['openai-other/model', 'openai', '', undefined])(
    'rejects the malformed correction ID %s',
    (correctionId) => {
      const sync = () =>
        buildCatalogs({
          overlays: { openai: { correct: [{ id: correctionId }] } },
          source,
        });

      expect(sync).toThrow(
        `Model catalog correction '${correctionId}' for provider 'openai' has a mismatched provider prefix`,
      );
    },
  );

  it('corrects nested aggregator IDs without changing their provider', () => {
    const nestedId = 'vercel/openai/reviewed';

    const { catalog, gateway } = buildCatalogs({
      overlays: { vercel: { correct: [{ id: nestedId, name: 'Reviewed' }] } },
      source: {
        vercel: {
          models: {
            'openai/reviewed': {
              ...model,
              id: 'openai/reviewed',
              cost: { input: 0, output: 0 },
            },
          },
        },
      },
    });

    expect(catalog).toEqual([{ id: nestedId, provider: 'vercel', mode: 'chat' }]);
    expect(gateway[0]).toMatchObject({
      id: nestedId,
      name: 'Reviewed',
      providers: ['vercel'],
      cost: { input: 0, output: 0 },
    });
  });

  it.each([
    ['add', { add: [{ id }] }],
    ['exclude', { exclude: [model.id] }],
  ])('rejects a correction also listed in %s', (_list, conflict) => {
    const sync = () =>
      buildCatalogs({
        overlays: { openai: { ...conflict, correct: [{ id }] } },
        source,
      });

    expect(sync).toThrow(
      `Model catalog correction '${id}' for provider 'openai' is also listed in add or exclude`,
    );
  });

  it.each(['mode', 'family', 'unknown'])('rejects the forbidden correction field %s', (field) => {
    const sync = () =>
      buildCatalogs({
        overlays: { openai: { correct: [{ id, [field]: 'chat' }] } },
        source,
      });

    expect(sync).toThrow(
      `Model catalog correction '${id}' for provider 'openai' sets forbidden field '${field}'`,
    );
  });

  it('rejects an exclude missing from the source', () => {
    const sync = () => buildCatalogs({ overlays: { openai: { exclude: ['missing'] } }, source });

    expect(sync).toThrow(
      "Model catalog exclude 'openai/missing' for provider 'openai' is missing from the source",
    );
  });

  it('allows an exclude still present in deprecated source models', () => {
    const { catalog } = buildCatalogs({
      overlays: { openai: { exclude: [model.id] } },
      source: { openai: { models: { [model.id]: { ...model, status: 'deprecated' } } } },
    });

    expect(catalog).toEqual([]);
  });

  it('applies additions after excluding the same source ID', () => {
    const replacement = {
      id,
      name: 'Replacement embedding',
      modalities: { input: ['text'], output: ['embedding'] },
      operations: ['embeddings'],
      capabilities: {},
      context: { input: 8192, output: 1024 },
      providers: ['openai'],
    };

    const { catalog, gateway } = buildCatalogs({
      overlays: { openai: { exclude: [model.id], add: [replacement] } },
      source,
    });

    expect(gateway).toEqual([replacement]);
    expect(catalog).toEqual([{ id, provider: 'openai', mode: 'embedding' }]);
  });

  it.each([
    ['text and audio input', ['text', 'audio'], 'chat'],
    ['audio-only input', ['audio'], 'audio_transcription'],
  ])('classifies %s with text output', (_label, input, mode) => {
    const { catalog } = buildCatalogs({
      overlays: {},
      source: {
        openai: { models: { [model.id]: { ...model, modalities: { input, output: ['text'] } } } },
      },
    });

    expect(catalog).toEqual([{ id, provider: 'openai', mode }]);
  });

  it.each([
    [['text', 'embedding'], ['embeddings'], 'embedding'],
    [['text', 'image'], ['images.generations'], 'image_generation'],
    [['text', 'video'], ['video.generations'], 'video_generation'],
    [['text', 'audio'], ['audio.speech'], 'audio_speech'],
    [['text'], ['evaluate'], 'evaluate'],
    [['text'], ['rerank'], 'rerank'],
  ])('preserves mode precedence for %s output over chat', (output, operations, mode) => {
    const { catalog } = buildCatalogs({
      overlays: {
        openai: {
          correct: [
            {
              id,
              modalities: { input: ['text', 'audio'], output },
              operations,
            },
          ],
        },
      },
      source,
    });

    expect(catalog).toEqual([{ id, provider: 'openai', mode }]);
  });

  it.each([
    ['ID', { ...model, id: 'text-embedding-test' }],
    ['family', { ...model, family: 'EMBEDDING' }],
  ])('warns about an uncorrected chat entry with embed in its %s', (_field, entry) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { catalog, gateway } = buildCatalogs({
      overlays: {},
      source: { openai: { models: { [entry.id]: entry } } },
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`openai/${entry.id}`));
    expect(catalog[0]?.mode).toBe('chat');
    expect(gateway[0]?.modalities).toEqual(model.modalities);
    expect(gateway[0]?.operations).toEqual(['chat.completions']);
  });

  it('does not warn about a reviewed correction even when it stays chat', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { catalog } = buildCatalogs({
      overlays: { openai: { correct: [{ id, name: 'Reviewed chat' }] } },
      source: { openai: { models: { [model.id]: { ...model, family: 'embed' } } } },
    });

    expect(catalog[0]?.mode).toBe('chat');
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn about an uncorrected embedding entry', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { catalog } = buildCatalogs({
      overlays: {},
      source: {
        openai: {
          models: {
            [model.id]: {
              ...model,
              family: 'embed',
              modalities: { input: ['text'], output: ['embedding'] },
            },
          },
        },
      },
    });

    expect(catalog[0]?.mode).toBe('embedding');
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    'google/gemini-embedding-001',
    'google/gemini-embedding-2',
    'mistral/mistral-embed',
    'openai/text-embedding-3-large',
    'openai/text-embedding-3-small',
    'openai/text-embedding-ada-002',
  ])('publishes the reviewed embedding correction for %s', (modelId) => {
    const entry = DEFAULT_MODEL_CATALOG.get(modelId);

    expect(entry?.modalities.output).toEqual(['embedding']);
    expect(entry?.operations).toEqual(['embeddings']);
    expect(catalog.find(({ id: catalogId }) => catalogId === modelId)?.mode).toBe('embedding');
  });

  it('preserves multimodal input for Gemini Embedding 2 in the committed catalog', () => {
    const entry = DEFAULT_MODEL_CATALOG.get('google/gemini-embedding-2');

    expect(entry?.modalities.input).toEqual(['text', 'image', 'audio', 'video']);
  });

  it('publishes the Gemini chat mode and dedicated transcription entry', () => {
    const transcribe = DEFAULT_MODEL_CATALOG.get('google/gemini-3.5-transcribe');

    expect(catalog).toContainEqual({
      id: 'google/gemini-3.5-flash',
      provider: 'google',
      mode: 'chat',
    });
    expect(catalog).toContainEqual({
      id: 'google/gemini-3.5-transcribe',
      provider: 'google',
      mode: 'audio_transcription',
    });
    expect(transcribe?.modalities).toEqual({ input: ['audio'], output: ['text'] });
    expect(transcribe?.operations).toEqual(['audio.transcriptions']);
  });

  it.each([
    ['openai/whisper-1', undefined],
    ['openai/gpt-4o-transcribe', { input: 2.5, output: 10 }],
    ['openai/gpt-4o-mini-transcribe', { input: 1.25, output: 5 }],
  ])('publishes the OpenAI transcription entry %s', (modelId, cost) => {
    const entry = DEFAULT_MODEL_CATALOG.get(modelId);

    expect(catalog).toContainEqual({
      id: modelId,
      provider: 'openai',
      mode: 'audio_transcription',
    });
    expect(entry?.modalities).toEqual({ input: ['audio'], output: ['text'] });
    expect(entry?.operations).toEqual(['audio.transcriptions']);
    expect(entry?.cost).toEqual(cost);
  });

  it('publishes chat mode for every committed text-and-audio input model with text-only output', () => {
    const entries = [...DEFAULT_MODEL_CATALOG.values()].filter(
      ({ modalities }) =>
        modalities.input.includes('text') &&
        modalities.input.includes('audio') &&
        modalities.output.length === 1 &&
        modalities.output[0] === 'text',
    );

    expect(entries.length).toBeGreaterThan(1);

    for (const entry of entries) {
      expect(catalog.find(({ id: catalogId }) => catalogId === entry.id)).toEqual({
        id: entry.id,
        provider: entry.id.slice(0, entry.id.indexOf('/')),
        mode: 'chat',
      });
    }
  });
});

describe('catalog sync modalities', () => {
  it('keeps PDF input and drops modalities outside the catalog set', () => {
    const reader = {
      ...model,
      id: 'reader',
      modalities: { input: ['text', 'image', 'pdf', 'hologram'], output: ['text'] },
    };

    const { gateway } = buildCatalogs({
      overlays: {},
      source: { anthropic: { models: { reader } } },
    });

    expect(gateway[0]?.modalities).toEqual({ input: ['text', 'image', 'pdf'], output: ['text'] });
  });

  it.each([
    ['anthropic/claude-sonnet-4-5', ['text', 'image', 'pdf']],
    ['openai/gpt-5', ['text', 'image']],
  ])('publishes the models.dev input types for %s', (id, input) => {
    expect(DEFAULT_MODEL_CATALOG.get(id)?.modalities.input).toEqual(input);
  });
});

describe('catalog sync reasoning options', () => {
  const reasoningModel = (reasoning_options: unknown) => ({
    ...model,
    reasoning: true,
    reasoning_options,
  });

  const sync = (reasoning_options: unknown) =>
    buildCatalogs({
      overlays: {},
      source: { openai: { models: { [model.id]: reasoningModel(reasoning_options) } } },
    }).gateway[0]?.capabilities;

  it('normalizes effort, budget and toggle options', () => {
    const capabilities = sync([
      { type: 'effort', values: ['low', null, 'null', 'high'] },
      { type: 'budget_tokens', min: 1024, max: 32_768 },
      { type: 'toggle' },
    ]);

    expect(capabilities?.reasoningOptions).toEqual([
      { type: 'effort', values: ['low', 'high'] },
      { type: 'budget_tokens', min: 1024, max: 32_768 },
      { type: 'toggle' },
    ]);
  });

  it('keeps effort without values and drops non-numeric budget limits', () => {
    const capabilities = sync([{ type: 'effort' }, { type: 'budget_tokens', min: '1024' }]);

    expect(capabilities?.reasoningOptions).toEqual([{ type: 'effort' }, { type: 'budget_tokens' }]);
  });

  it('drops unknown option shapes', () => {
    const capabilities = sync([{ type: 'adaptive' }, null, 'effort', { type: 'toggle' }]);

    expect(capabilities?.reasoningOptions).toEqual([{ type: 'toggle' }]);
  });

  it('omits reasoning options when none remain', () => {
    expect(sync([])).not.toHaveProperty('reasoningOptions');
    expect(sync([{ type: 'adaptive' }])).not.toHaveProperty('reasoningOptions');
    expect(sync(undefined)).not.toHaveProperty('reasoningOptions');
  });

  it('publishes reasoning options in the committed gateway catalog', () => {
    expect(DEFAULT_MODEL_CATALOG.get('anthropic/claude-sonnet-4-6')?.capabilities).toHaveProperty(
      'reasoningOptions',
      [
        { type: 'effort', values: ['low', 'medium', 'high', 'max'] },
        { type: 'budget_tokens', min: 1024 },
      ],
    );
  });
});

describe('catalog sync aggregator providers', () => {
  const priced = { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 };

  const syncVercel = (models: Record<string, unknown>) =>
    buildCatalogs({ overlays: {}, source: { vercel: { models } } }).gateway.map(
      ({ id }: { id: string }) => id,
    );

  it('keeps nested creator/model IDs under the vercel prefix', () => {
    const ids = syncVercel({
      'anthropic/claude-sonnet-4.6': { ...model, id: 'anthropic/claude-sonnet-4.6', cost: priced },
    });

    expect(ids).toEqual(['vercel/anthropic/claude-sonnet-4.6']);
  });

  it('skips unpriced and non-text models but keeps real $0 prices', () => {
    const ids = syncVercel({
      'voyage/voyage-3.5': { ...model, id: 'voyage/voyage-3.5' },
      'meta/llama-free': { ...model, id: 'meta/llama-free', cost: { input: 0, output: 0 } },
      'openai/gpt-image-1': {
        ...model,
        id: 'openai/gpt-image-1',
        modalities: { input: ['text'], output: ['image'] },
        cost: priced,
      },
      'openai/gpt-5.4-mini': { ...model, id: 'openai/gpt-5.4-mini', cost: priced },
    });

    expect(ids).toEqual(['vercel/meta/llama-free', 'vercel/openai/gpt-5.4-mini']);
  });

  it('keeps unpriced models for direct providers', () => {
    const { gateway } = buildCatalogs({
      overlays: {},
      source: { openai: { models: { [model.id]: model } } },
    });

    expect(gateway.map(({ id }: { id: string }) => id)).toEqual([`openai/${model.id}`]);
  });

  it('publishes only priced text-output models for vercel in the committed catalog', () => {
    const entries = [...DEFAULT_MODEL_CATALOG.values()].filter(({ id }) =>
      id.startsWith('vercel/'),
    );

    expect(entries.length).toBeGreaterThan(0);
    expect(DEFAULT_MODEL_CATALOG.get('vercel/anthropic/claude-sonnet-4.6')?.cost).toBeDefined();
    expect(entries.some(({ id }) => id.startsWith('vercel/voyage/'))).toBe(false);

    for (const entry of entries) {
      expect(entry.operations).toContain('chat.completions');
      expect(entry.modalities.output).toEqual(['text']);
      expect(entry.cost).toBeDefined();
    }
  });
});

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

    expect(gateway.map(({ id }: { id: string }) => id)).toEqual([`bedrock/${replacement.id}`]);
  });

  it('keeps priced aggregator models, including free variants, and skips unpriced routers', () => {
    const priced = { ...model, cost: { input: 3, output: 15, cache_read: 0.3 } };

    const { gateway } = buildCatalogs({
      overlays: {},
      source: {
        openrouter: {
          models: {
            'anthropic/claude-sonnet-4.6': { ...priced, id: 'anthropic/claude-sonnet-4.6' },
            'meta-llama/llama-3.3-70b-instruct:free': {
              ...model,
              id: 'meta-llama/llama-3.3-70b-instruct:free',
              cost: { input: 0, output: 0 },
            },
            'openrouter/auto': { ...model, id: 'openrouter/auto' },
          },
        },
      },
    });

    expect(gateway.map(({ id }: { id: string }) => id)).toEqual([
      'openrouter/anthropic/claude-sonnet-4.6',
      'openrouter/meta-llama/llama-3.3-70b-instruct:free',
    ]);
    expect(gateway[0]?.cost).toEqual({ input: 3, output: 15, cache_read: 0.3 });
  });

  it('keeps unpriced models for direct providers', () => {
    const { gateway } = buildCatalogs({
      overlays: {},
      source: { openai: { models: { [model.id]: model } } },
    });

    expect(gateway.map(({ id }: { id: string }) => id)).toEqual([`openai/${model.id}`]);
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

    expect(gateway.every((entry: object) => !Object.hasOwn(entry, 'mode'))).toBe(true);
  });

  it('publishes both TypeSafe evaluation IDs with matching overlay pricing', () => {
    const ids = ['typesafe-ai/jev', 'typesafe-ai/jev-latest'];

    const generated = buildCatalogs({
      overlays: { 'typesafe-ai': overlays['typesafe-ai'] },
      source: {},
    });

    for (const id of ids) {
      const gatewayEntry = DEFAULT_MODEL_CATALOG.get(id);

      expect(gatewayEntry).toEqual(
        generated.gateway.find((entry: { id: string }) => entry.id === id),
      );
      expect(catalog.find((entry) => entry.id === id)).toEqual(
        generated.catalog.find((entry: { id: string }) => entry.id === id),
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

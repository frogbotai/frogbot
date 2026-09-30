import { describe, expect, it } from 'vitest';

import overlays from '../../../../scripts/fixtures/model-catalog-overlays.json' with { type: 'json' };
import source from '../../../../scripts/fixtures/models-dev.json' with { type: 'json' };

async function loadSync() {
  return import('../../../../scripts/sync-catalog.mjs');
}

describe('model catalog sync', () => {
  it('maps provider names and ignores unsupported providers', async () => {
    const { buildCatalogs } = await loadSync();

    const { catalog } = buildCatalogs({ overlays, source });

    expect(catalog.map(({ id }) => id)).toEqual([
      'anthropic/claude-audio-chat',
      'anthropic/claude-current',
      'anthropic/embedding-fixture',
      'fireworks/zeta',
      'voyage/voyage-fixture',
    ]);
  });

  it('excludes deprecated models and applies overlays', async () => {
    const { buildCatalogs } = await loadSync();

    const { catalog } = buildCatalogs({ overlays, source });

    expect(catalog).not.toContainEqual(expect.objectContaining({ id: 'anthropic/claude-retired' }));
    expect(catalog).toContainEqual({
      id: 'voyage/voyage-fixture',
      mode: 'embedding',
      provider: 'voyage',
    });
  });

  it('maps models.dev metadata to the gateway catalog shape', async () => {
    const { buildCatalogs } = await loadSync();

    const { gateway } = buildCatalogs({ overlays, source });

    expect(gateway.find(({ id }) => id === 'anthropic/claude-current')).toEqual({
      id: 'anthropic/claude-current',
      name: 'Claude Current',
      created: '2026-01-02',
      knowledge: '2025-12-01',
      modalities: { input: ['text', 'image'], output: ['text'] },
      operations: ['chat.completions'],
      capabilities: {
        promptCaching: true,
        reasoning: true,
        streaming: true,
        structuredOutput: true,
        toolCalling: true,
        vision: true,
      },
      context: { input: 200000, output: 64000 },
      cost: { input: 3, output: 15, cache_read: 0.1, cache_write: 3.75 },
      providers: ['anthropic'],
    });
  });

  it('computes embedding mode from corrected modalities and operations', async () => {
    const { buildCatalogs } = await loadSync();

    const { catalog } = buildCatalogs({ overlays, source });

    expect(catalog).toContainEqual({
      id: 'anthropic/embedding-fixture',
      mode: 'embedding',
      provider: 'anthropic',
    });
  });

  it('shallowly replaces corrected fields and retains other upstream metadata', async () => {
    const { buildCatalogs } = await loadSync();

    const { gateway } = buildCatalogs({ overlays, source });

    expect(gateway.find(({ id }) => id === 'anthropic/embedding-fixture')).toEqual({
      id: 'anthropic/embedding-fixture',
      name: 'Embedding Fixture',
      created: '2026-01-03',
      knowledge: '2025-12-01',
      modalities: { input: ['text'], output: ['embedding'] },
      operations: ['embeddings'],
      capabilities: {},
      context: { input: 8192, output: 1024 },
      cost: { input: 0.1, output: 0 },
      sdk: {
        npm: '@ai-sdk/anthropic',
        api: 'https://api.anthropic.com/v1',
      },
      providers: ['anthropic'],
    });
  });

  it('maps text and audio input with text output to chat mode', async () => {
    const { buildCatalogs } = await loadSync();

    const { catalog, gateway } = buildCatalogs({ overlays, source });

    expect(catalog).toContainEqual({
      id: 'anthropic/claude-audio-chat',
      mode: 'chat',
      provider: 'anthropic',
    });
    expect(gateway.find(({ id }) => id === 'anthropic/claude-audio-chat')).toMatchObject({
      modalities: { input: ['text', 'audio'], output: ['text'] },
      operations: ['chat.completions', 'audio.transcriptions'],
    });
  });

  it('rejects a fixture correction after its source model disappears', async () => {
    const { buildCatalogs } = await loadSync();
    const staleSource = {
      ...source,
      anthropic: {
        ...source.anthropic,
        models: Object.fromEntries(
          Object.entries(source.anthropic.models).filter(([id]) => id !== 'embedding-fixture'),
        ),
      },
    };

    expect(() => buildCatalogs({ overlays, source: staleSource })).toThrow(
      "Model catalog correction 'anthropic/embedding-fixture' for provider 'anthropic' is missing from the synced output",
    );
  });

  it('leaves source and overlay fixtures unchanged when applying corrections', async () => {
    const { buildCatalogs } = await loadSync();
    const originalSource = structuredClone(source);
    const originalOverlays = structuredClone(overlays);

    buildCatalogs({ overlays, source });

    expect(source).toEqual(originalSource);
    expect(overlays).toEqual(originalOverlays);
  });

  it('renders deterministic committed artifacts', async () => {
    const { buildCatalogs, renderCatalog, renderGatewayCatalog } = await loadSync();

    const first = buildCatalogs({ overlays, source });
    const second = buildCatalogs({
      overlays: Object.fromEntries(Object.entries(overlays).reverse()),
      source: Object.fromEntries(
        Object.entries(source)
          .reverse()
          .map(([provider, entry]) => [
            provider,
            { ...entry, models: Object.fromEntries(Object.entries(entry.models).reverse()) },
          ]),
      ),
    });

    expect(renderCatalog(first.catalog)).toBe(renderCatalog(second.catalog));
    expect(renderGatewayCatalog(first.gateway)).toBe(renderGatewayCatalog(second.gateway));
  });
});

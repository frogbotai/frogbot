import type * as FsPromises from 'node:fs/promises';
import { readFile, writeFile } from 'node:fs/promises';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import overlays from '../../../../scripts/fixtures/model-catalog-overlays.json' with { type: 'json' };
import source from '../../../../scripts/fixtures/models-dev.json' with { type: 'json' };

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof FsPromises>()),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

async function loadSync() {
  return import('../../../../scripts/sync-catalog.mjs');
}

describe('model catalog sync', () => {
  it('maps provider names and ignores unsupported providers', async () => {
    const { buildCatalogs } = await loadSync();

    const { catalog } = buildCatalogs({ overlays, source });

    expect(catalog.map(({ id }: { id: string }) => id)).toEqual([
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

    expect(gateway.find(({ id }: { id: string }) => id === 'anthropic/claude-current')).toEqual({
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

    expect(gateway.find(({ id }: { id: string }) => id === 'anthropic/embedding-fixture')).toEqual({
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
    expect(
      gateway.find(({ id }: { id: string }) => id === 'anthropic/claude-audio-chat'),
    ).toMatchObject({
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

describe('provider logo sync', () => {
  const svg =
    '<svg viewBox="0 0 40 40"><path d="M0 0h40v40H0z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" opacity="0.5"/></svg>';
  const generic = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';
  const probe = 'frogbot-missing-provider-logo';

  function logoFetch(responses: Record<string, Response | Error> = {}) {
    return vi.fn<typeof fetch>((input) => {
      const url = input instanceof Request ? input.url : input.toString();

      if (url === 'https://models.dev/api.json') {
        const provider = {
          models: { 'claude-current': source.anthropic.models['claude-current'] },
        };

        return Promise.resolve(Response.json({ 'amazon-bedrock': provider, anthropic: provider }));
      }

      const provider = url.slice('https://models.dev/logos/'.length, -'.svg'.length);
      const response = responses[provider] ?? new Response(null, { status: 404 });

      if (response instanceof Error) return Promise.reject(response);

      return Promise.resolve(response);
    });
  }

  function renderedLogos() {
    return vi
      .mocked(writeFile)
      .mock.calls.find(([path]) => String(path).endsWith('/chat/provider-logos.ts'))?.[1];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readFile).mockResolvedValue('{}');
  });

  it('keeps the viewBox and allowed path attributes with React names', async () => {
    const { logoNodes } = await loadSync();

    const logo = logoNodes(svg);

    expect(logo).toEqual({
      viewBox: '0 0 40 40',
      nodes: [
        [
          'path',
          {
            d: 'M0 0h40v40H0z',
            fill: 'currentColor',
            fillRule: 'evenodd',
            clipRule: 'evenodd',
            opacity: '0.5',
          },
        ],
      ],
    });
  });

  it('drops event handlers and other attributes', async () => {
    const { logoNodes } = await loadSync();

    const logo = logoNodes(
      '<svg viewBox="0 0 40 40" onload="alert(1)"><path d="M0 0" onload="alert(1)" stroke="red" style="fill:red"></path></svg>',
    );

    expect(logo).toEqual({ viewBox: '0 0 40 40', nodes: [['path', { d: 'M0 0' }]] });
  });

  it.each(['script', 'image', 'use', 'g', 'linearGradient'])(
    'rejects a %s element with the provider name before writing outputs',
    async (element) => {
      const { syncCatalog } = await loadSync();
      const fetchImpl = logoFetch({
        'amazon-bedrock': new Response(svg),
        anthropic: new Response(`<svg viewBox="0 0 40 40"><${element}/></svg>`),
      });

      await expect(syncCatalog({ fetchImpl })).rejects.toThrow(
        `Invalid models.dev logo for 'anthropic': Unsupported SVG element: ${element}`,
      );

      expect(writeFile).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['a use reference', '<svg viewBox="0 0 40 40"><use href="https://evil.test/x.svg#a"/></svg>'],
    [
      'a child inside a path',
      '<svg viewBox="0 0 40 40"><path d="M0 0"><use href="#a"/></path></svg>',
    ],
    ['an XML prolog', '<?xml version="1.0"?><svg viewBox="0 0 40 40"><path d="M0 0"/></svg>'],
    ['a nested svg', '<svg viewBox="0 0 40 40"><svg onload="alert(1)"/></svg>'],
  ])('rejects %s instead of passing markup through', async (_, hostile) => {
    const { logoNodes } = await loadSync();

    expect(() => logoNodes(hostile)).toThrow();
  });

  it.each([
    'url(https://evil.test/x.svg#a)',
    'URL( "https://evil.test/x.svg#a" )',
    '\\75rl(https://evil.test/x.svg#a)',
    'var(--evil)',
  ])('rejects the external or computed paint value %s', async (fill) => {
    const { logoNodes } = await loadSync();

    expect(() =>
      logoNodes(`<svg viewBox="0 0 40 40"><path d="M0 0" fill='${fill}'/></svg>`),
    ).toThrow('Unsupported SVG attribute value: fill');
  });

  it('writes the same logo module when rerun against the same responses', async () => {
    const { syncCatalog } = await loadSync();

    const responses = () =>
      logoFetch({
        [probe]: new Response(generic),
        'amazon-bedrock': new Response(svg),
        anthropic: new Response(generic),
      });

    await syncCatalog({ fetchImpl: responses() });

    const first = renderedLogos();

    vi.mocked(writeFile).mockClear();

    await syncCatalog({ fetchImpl: responses() });

    expect(renderedLogos()).toBe(first);
  });

  it.each([
    ['viewBox', '<svg><path d="M0 0"/></svg>'],
    ['path d', '<svg viewBox="0 0 40 40"><path fill="currentColor"/></svg>'],
  ])('rejects missing %s with the provider name', async (attribute, invalid) => {
    const { syncCatalog } = await loadSync();
    const fetchImpl = logoFetch({ 'amazon-bedrock': new Response(invalid) });

    await expect(syncCatalog({ fetchImpl })).rejects.toThrow(
      `Invalid models.dev logo for 'amazon-bedrock': Missing SVG ${attribute}`,
    );

    expect(writeFile).not.toHaveBeenCalled();
  });

  it('omits a provider response identical to the generic probe', async () => {
    const { syncCatalog } = await loadSync();
    const fetchImpl = logoFetch({
      [probe]: new Response(generic),
      'amazon-bedrock': new Response(svg),
      anthropic: new Response(generic),
    });

    await syncCatalog({ fetchImpl });

    expect(renderedLogos()).toContain('bedrock:');
    expect(renderedLogos()).not.toContain('anthropic:');
  });

  it('accepts a probe 404 and keys logos by FrogBot slug', async () => {
    const { syncCatalog } = await loadSync();
    const fetchImpl = logoFetch({ 'amazon-bedrock': new Response(svg) });

    await syncCatalog({ fetchImpl });

    expect(renderedLogos()).toContain('bedrock:');
    expect(renderedLogos()).not.toContain('amazon-bedrock');
    expect(fetchImpl.mock.calls.map(([url]) => url)).not.toContain(
      'https://models.dev/logos/openai.svg',
    );
    expect(writeFile).toHaveBeenCalledTimes(4);
  });

  it('bounds catalog and logo requests with abort signals', async () => {
    const { syncCatalog } = await loadSync();
    const fetchImpl = vi.fn(logoFetch());

    await syncCatalog({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith('https://models.dev/api.json', {
      signal: expect.any(AbortSignal),
    });
    expect(fetchImpl).toHaveBeenCalledWith('https://models.dev/logos/amazon-bedrock.svg', {
      signal: expect.any(AbortSignal),
    });
  });

  it('rejects a catalog HTTP error before fetching logos or writing outputs', async () => {
    const { syncCatalog } = await loadSync();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));

    await expect(syncCatalog({ fetchImpl })).rejects.toThrow('models.dev request failed: 500');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('identifies a catalog network failure without writing outputs', async () => {
    const { syncCatalog } = await loadSync();
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Network unavailable'));

    await expect(syncCatalog({ fetchImpl })).rejects.toThrow(
      'models.dev catalog request failed: Network unavailable',
    );

    expect(writeFile).not.toHaveBeenCalled();
  });

  it('omits a provider 404', async () => {
    const { syncCatalog } = await loadSync();
    const fetchImpl = logoFetch({
      [probe]: new Response(generic),
      'amazon-bedrock': new Response(svg),
    });

    await syncCatalog({ fetchImpl });

    expect(renderedLogos()).toContain('bedrock:');
    expect(renderedLogos()).not.toContain('anthropic:');
  });

  it.each([probe, 'anthropic'])(
    'fails on a 500 for %s without writing outputs',
    async (provider) => {
      const { syncCatalog } = await loadSync();
      const fetchImpl = logoFetch({
        'amazon-bedrock': new Response(svg),
        [provider]: new Response(null, { status: 500, statusText: 'Internal Server Error' }),
      });

      await expect(syncCatalog({ fetchImpl })).rejects.toThrow(
        `models.dev logo request for '${provider}' failed: 500 Internal Server Error`,
      );

      expect(writeFile).not.toHaveBeenCalled();
    },
  );

  it.each([
    new TypeError('Network unavailable'),
    new DOMException('Request timed out', 'TimeoutError'),
  ])('fails clearly on a logo request error without writing outputs: %s', async (error) => {
    const { syncCatalog } = await loadSync();
    const fetchImpl = logoFetch({
      'amazon-bedrock': new Response(svg),
      anthropic: error,
    });

    await expect(syncCatalog({ fetchImpl })).rejects.toThrow(
      `models.dev logo request for 'anthropic' failed: ${error.message}`,
    );

    expect(writeFile).not.toHaveBeenCalled();
  });

  it('renders identical sorted modules for different input orderings', async () => {
    const { logoNodes, renderProviderLogos } = await loadSync();
    const logo = logoNodes(svg);

    const first = await renderProviderLogos({ openai: logo, bedrock: logo });
    const second = await renderProviderLogos({ bedrock: logo, openai: logo });

    expect(first).toBe(second);
    expect(first.indexOf('bedrock:')).toBeLessThan(first.indexOf('openai:'));
    expect(first).toContain("import type { IconNode } from '../icons/types.js';");
    expect(first).toContain('fillRule:');
  });
});

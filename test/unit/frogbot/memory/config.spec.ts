import type * as PayloadModule from 'payload';
import { describe, expect, it, vi } from 'vitest';

import type { CatalogModelId } from '../../../../packages/frogbot/src/ai/generated.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import type { FrogBot } from '../../../../packages/frogbot/src/frogbot.js';
import { databaseMemory } from '../../../../packages/frogbot/src/memory/database/adapter.js';
import { createMemory } from '../../../../packages/frogbot/src/memory/index.js';
import type { MemoryAdapter } from '../../../../packages/frogbot/src/memory/types.js';

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof PayloadModule>()),
  buildConfig: vi.fn((config: Record<string, unknown>) =>
    Promise.resolve({ globals: [], ...config }),
  ),
}));

const { sanitize } = await import('../../../../packages/frogbot/src/config/sanitize.js');

function makeConfig(overrides?: Partial<FrogBotConfig>): FrogBotConfig {
  return {
    secret: 'test-secret',
    db: { name: 'sqlite' } as FrogBotConfig['db'],
    collections: [{ slug: 'users', auth: true, fields: [] }],
    ...overrides,
  };
}

function stubAdapter(overrides: Partial<MemoryAdapter> = {}): MemoryAdapter {
  const memory = {
    id: '1',
    scope: 'team',
    text: 'Stub',
    pinned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  return {
    save: vi.fn(() => Promise.resolve(memory)),
    search: vi.fn(() => Promise.resolve([])),
    list: vi.fn(() => Promise.resolve({ docs: [], hasNextPage: false })),
    get: vi.fn(() => Promise.resolve(memory)),
    update: vi.fn(() => Promise.resolve(memory)),
    forget: vi.fn(() => Promise.resolve({ deleted: 0 })),
    ...overrides,
  };
}

function stubFrogBot(memory?: MemoryAdapter, user: Record<string, unknown> | null = null) {
  const frogbot = {
    config: { memory, agents: [{ slug: 'support' }] },
    createRequest: vi.fn((req?: object) => Promise.resolve({ user, ...req, t: vi.fn() })),
  } as unknown as FrogBot;

  return createMemory(frogbot);
}

describe('memory config', () => {
  it('adds no collection when memory is unset', () => {
    const slugs = sanitize(makeConfig()).collections.map(({ slug }) => slug);

    expect(slugs).toEqual(['users', 'frogbot-waitpoints']);
    expect(sanitize(makeConfig()).memory).toBeUndefined();
    expect(sanitize(makeConfig()).settings.map(({ path }) => path)).not.toContain('memory');
  });

  it('adds the Memory settings page when memory is set', () => {
    const { settings } = sanitize(makeConfig({ memory: databaseMemory() }));

    expect(settings).toContainEqual({
      path: 'memory',
      label: 'Memory',
      Component: '@frogbotai/ui/admin/rsc#MemoryView',
    });
  });

  it('rejects an app settings page at the memory path', () => {
    expect(() =>
      sanitize(
        makeConfig({
          memory: databaseMemory(),
          settings: [{ path: 'memory', label: 'Mine', Component: './Mine#Mine' }],
        }),
      ),
    ).toThrow("settings path 'memory' is reserved");
  });

  it('adds the hidden memories collection for databaseMemory()', async () => {
    const result = sanitize(makeConfig({ memory: databaseMemory() }));
    const built = await result._internal.payloadConfig;
    const memories = built.collections.find(({ slug }) => slug === 'frogbot-memories');

    expect(result.collections.map(({ slug }) => slug)).toEqual([
      'users',
      'frogbot-waitpoints',
      'frogbot-memories',
    ]);
    expect(result.collections.at(-1)?.search?.memory?.lexical?.fields).toEqual([
      { path: 'text', localized: false },
      { path: 'key', localized: false },
    ]);
    expect(memories?.admin.hidden).toBe(true);
    expect(memories?.graphQL).toBe(false);
    expect('memory' in built).toBe(false);
  });

  it('declares no search index on plain MongoDB unless atlasSearch is set', () => {
    const mongo = { name: 'mongoose' } as FrogBotConfig['db'];
    const plain = sanitize(makeConfig({ db: mongo, memory: databaseMemory() }));
    const atlas = sanitize(
      makeConfig({ db: mongo, memory: databaseMemory({ atlasSearch: true }) }),
    );

    expect(plain.collections.at(-1)?.search).toBeUndefined();
    expect(atlas.collections.at(-1)?.search?.memory).toBeDefined();
  });

  it('adds a vector to the index when an embedding model is set', () => {
    const result = sanitize(
      makeConfig({
        memory: databaseMemory({
          embeddingModel: 'test/embedder' as CatalogModelId,
          dimensions: 3,
        }),
      }),
    );

    expect(result.collections.at(-1)?.search?.memory?.vector).toMatchObject({
      path: 'embedding',
      dimensions: 3,
    });
  });

  it.each(['me', 'agent'])('rejects a custom scope named %s', (word) => {
    expect(() =>
      sanitize(makeConfig({ memory: databaseMemory({ scopes: { [word]: () => 'x' } }) })),
    ).toThrow(`[frogbot] memory: scope '${word}' is built in and can't be replaced`);
  });

  it('rejects a scope word that is not lowercase', () => {
    expect(() =>
      sanitize(makeConfig({ memory: databaseMemory({ scopes: { Client: () => 'x' } }) })),
    ).toThrow("scope 'Client' must start with a lowercase letter");
  });

  it('rejects an adapter missing a method', () => {
    const { forget: _forget, ...partial } = stubAdapter();

    expect(() => sanitize(makeConfig({ memory: partial as MemoryAdapter }))).toThrow(
      '[frogbot] memory: the adapter must define `forget`',
    );
  });

  it('rejects an app collection with the memories slug', () => {
    expect(() =>
      sanitize(
        makeConfig({
          collections: [{ slug: 'frogbot-memories', fields: [] }],
          memory: databaseMemory(),
        }),
      ),
    ).toThrow("collection slug 'frogbot-memories' is reserved for memories");
  });

  it('needs dimensions with an embedding model', () => {
    expect(() => databaseMemory({ embeddingModel: 'test/embedder' } as never)).toThrow(
      '`dimensions` must be the embedding size',
    );
    expect(() => databaseMemory({ maxPerScope: 0 })).toThrow('`maxPerScope` must be a positive');
  });
});

describe('frogbot.memory', () => {
  it('fails with the fix when memory is unset', async () => {
    await expect(stubFrogBot().list({ scope: 'team' })).rejects.toThrow(
      'Set `memory: databaseMemory()`',
    );
  });

  it('fails with invalid for an undeclared scope word', async () => {
    await expect(stubFrogBot(stubAdapter()).list({ scope: 'client' })).rejects.toMatchObject({
      name: 'FrogBotError',
      code: 'memory.invalid-scope',
    });
  });

  it('resolves scope IDs from the host, never from the caller', async () => {
    const adapter = stubAdapter({
      namespace: 'app',
      scopes: { client: ({ chat }) => chat?.client as string | undefined },
    });

    const memory = stubFrogBot(adapter, { id: 7, collection: 'users' });

    await memory.list({ scope: 'me' });
    await memory.list({ scope: 'agent', agent: 'support' });
    await memory.list({ scope: 'team' });
    await memory.list({ scope: 'client', chat: { client: 'acme' } });

    expect(vi.mocked(adapter.list).mock.calls.map(([args]) => [args.scope, args.scopeId])).toEqual([
      ['me', 'me:users:7'],
      ['agent', 'agent:support'],
      ['team', 'team'],
      ['client', 'client:acme'],
    ]);
    expect(vi.mocked(adapter.list).mock.calls[0][0]).toMatchObject({
      namespace: 'app',
      limit: 100,
      page: 1,
    });
  });

  it('lets the app replace team', async () => {
    const adapter = stubAdapter({
      scopes: { team: ({ req }) => (req.user as { co?: string }).co },
    });

    await stubFrogBot(adapter, { id: 1, collection: 'users', co: 'acme' }).list({ scope: 'team' });

    expect(vi.mocked(adapter.list).mock.calls[0][0].scopeId).toBe('team:acme');
  });

  it('fails with invalid when a scope has no value for the request', async () => {
    const adapter = stubAdapter({ scopes: { client: () => undefined } });

    await expect(stubFrogBot(adapter).list({ scope: 'client' })).rejects.toMatchObject({
      code: 'memory.invalid-scope',
    });
    await expect(stubFrogBot(adapter).list({ scope: 'me' })).rejects.toMatchObject({
      code: 'memory.invalid-scope',
    });
    await expect(stubFrogBot(adapter).list({ scope: 'agent' })).rejects.toMatchObject({
      code: 'memory.invalid-scope',
    });
  });

  it('refuses shared scopes without access functions when access is checked', async () => {
    const adapter = stubAdapter();
    const memory = stubFrogBot(adapter, { id: 1, collection: 'users' });

    await expect(memory.list({ scope: 'team', overrideAccess: false })).rejects.toMatchObject({
      status: 403,
    });
    await expect(memory.list({ scope: 'me', overrideAccess: false })).resolves.toBeDefined();
    expect(adapter.list).toHaveBeenCalledTimes(1);
  });

  it('refuses me with 403 when nobody is signed in and access is checked', async () => {
    const adapter = stubAdapter();

    await expect(
      stubFrogBot(adapter).list({ scope: 'me', overrideAccess: false }),
    ).rejects.toMatchObject({ status: 403 });
    expect(adapter.list).not.toHaveBeenCalled();
  });

  it('calls the access function with the resolved scope', async () => {
    const read = vi.fn(({ scope }: { scope: string }) => scope === 'team');
    const adapter = stubAdapter({ access: { read } });
    const memory = stubFrogBot(adapter);

    await memory.list({ scope: 'team', overrideAccess: false });

    await expect(
      memory.save({ scope: 'team', text: 'x', overrideAccess: false }),
    ).rejects.toMatchObject({ status: 403 });
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ scope: 'team', scopeId: 'team' }));
  });

  it('validates input before the adapter runs', async () => {
    const adapter = stubAdapter();
    const memory = stubFrogBot(adapter);

    for (const call of [
      memory.save({ scope: 'team', text: '   ' }),
      memory.search({ scope: 'team', query: 'x', limit: 101 }),
      memory.update({ scope: 'team', id: '1' }),
      memory.list({ scope: 'team', page: 0 }),
    ]) {
      await expect(call).rejects.toMatchObject({ code: 'memory.invalid' });
    }

    expect(adapter.save).not.toHaveBeenCalled();
  });

  it('exposes the adapter sync', async () => {
    const sync = {
      push: vi.fn(() => Promise.resolve()),
      pull: vi.fn(() => Promise.resolve({ changes: [], cursor: null })),
    };

    const memory = stubFrogBot(stubAdapter({ sync }));

    await memory.sync?.push([]);
    await memory.sync?.pull(null);

    expect(sync.push).toHaveBeenCalledWith([]);
    expect(sync.pull).toHaveBeenCalledWith(null);
  });
});

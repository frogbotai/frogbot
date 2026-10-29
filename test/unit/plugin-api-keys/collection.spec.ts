import type { FrogBotConfig, FrogBotRequest } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import { apiKeysPlugin } from '../../../packages/plugins/plugin-api-keys/src/index.js';

function manager(collectionSlug = 'api-keys') {
  return {
    path: '@frogbotai/plugin-api-keys/rsc#ApiKeysManagerServer',
    clientProps: { collectionSlug },
  };
}

function makeConfig(): FrogBotConfig {
  return {
    secret: 'test',
    db: {} as FrogBotConfig['db'],
    collections: [{ slug: 'users', auth: true, fields: [] }],
  };
}

function request(fields: { user?: { id: string; roles: string[] } } = {}): FrogBotRequest {
  return fields as unknown as FrogBotRequest;
}

async function getCollection(options: Parameters<typeof apiKeysPlugin>[0] = {}) {
  const config = await apiKeysPlugin(options)(makeConfig());

  return config.collections.find((collection) => collection.slug === 'api-keys')!;
}

describe('API keys collection', () => {
  it('injects secure owner-scoped fields and access', async () => {
    const collection = await getCollection();

    expect(collection.fields.map((field) => ('name' in field ? field.name : null))).toEqual([
      'name',
      'owner',
      'prefix',
      'tokenHash',
      'lastUsedAt',
      'revokedAt',
      'actions',
    ]);
    expect(
      await collection.access?.read?.({
        slug: 'test',
        req: request({ user: { id: 'user-1', roles: ['member'] } }),
      }),
    ).toEqual({
      owner: { equals: 'user-1' },
    });
    expect(
      await collection.access?.update?.({
        slug: 'test',
        req: request({ user: { id: 'user-1', roles: ['member'] } }),
      }),
    ).toEqual({
      owner: { equals: 'user-1' },
    });
    expect(await collection.access?.create?.({ slug: 'test', req: request() })).toBe(false);
    expect(await collection.access?.delete?.({ slug: 'test', req: request() })).toBe(false);
    expect(await collection.access?.read?.({ slug: 'test', req: request() })).toBe(false);
    expect(await collection.access?.update?.({ slug: 'test', req: request() })).toBe(false);

    for (const name of ['owner', 'prefix', 'tokenHash', 'lastUsedAt', 'revokedAt']) {
      const field = collection.fields.find((item) => 'name' in item && item.name === name);

      expect('access' in field! && field.access?.update?.({} as never)).toBe(false);
    }

    expect(collection.admin?.views).toEqual([
      {
        type: 'list',
        defaultFields: ['name', 'prefix', 'lastUsedAt', 'revokedAt', 'actions'],
        components: { actions: [manager()] },
      },
    ]);
    expect(collection.fields.at(-1)).toMatchObject({
      name: 'actions',
      admin: { components: { Cell: '@frogbotai/plugin-api-keys/client#RevokeApiKey' } },
    });

    const revokedAt = collection.fields.find(
      (field) => 'name' in field && field.name === 'revokedAt',
    );

    const condition = 'admin' in revokedAt! ? revokedAt.admin?.condition : undefined;

    expect(condition?.({}, { revokedAt: null }, {} as never)).toBe(false);
    expect(condition?.({}, { revokedAt: '2026-08-02T00:00:00.000Z' }, {} as never)).toBe(true);
  });

  it('mints multiple keys while storing only hashes', async () => {
    const collection = await getCollection();
    const create = vi
      .fn()
      .mockResolvedValueOnce({ id: 'key-1', createdAt: 'now' })
      .mockResolvedValueOnce({ id: 'key-2', createdAt: 'now' });

    const req = {
      user: { id: 'user-1' },
      json: () => Promise.resolve({ name: 'Deploy' }),
      frogbot: { create },
    } as unknown as FrogBotRequest;

    const endpoint = collection.endpoints!.find((item) => item.path === '/mint')!;
    const first = await endpoint.handler(req);
    const second = await endpoint.handler(req);
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.status).toBe(201);
    expect(firstBody.token).not.toBe(secondBody.token);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('token');
    expect(create.mock.calls[0][0].data.tokenHash).toHaveLength(64);
    expect(firstBody.token).toMatch(/^fb_/);
  });

  it('authenticates key mutations before validating input', async () => {
    const collection = await getCollection();
    const req = { routeParams: {}, json: () => Promise.resolve({}) } as unknown as FrogBotRequest;

    for (const path of ['/mint', '/:id/revoke', '/:id/rotate']) {
      const endpoint = collection.endpoints!.find((item) => item.path === path)!;

      expect((await endpoint.handler(req)).status).toBe(401);
    }
  });

  it('refuses mint and rotate for API-key requests without writing', async () => {
    const collection = await getCollection();
    const create = vi.fn();
    const update = vi.fn();
    const req = {
      user: { id: 'user-1', _strategy: 'api-key', apiKeyId: 'key-1' },
      routeParams: { id: 'key-1' },
      json: () => Promise.resolve({ name: 'Persist' }),
      frogbot: {
        find: vi
          .fn()
          .mockResolvedValue({ docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1' }] }),
        create,
        update,
      },
    } as unknown as FrogBotRequest;

    for (const path of ['/mint', '/:id/rotate']) {
      const endpoint = collection.endpoints!.find((item) => item.path === path)!;
      const response = await endpoint.handler(req);

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: 'An API key cannot mint or rotate API keys. Sign in to manage keys.',
      });
    }

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('shows attributed usage cost in list and document views', async () => {
    const config = makeConfig();
    config.ai = { providers: { openai: { apiKey: 'test' } } };
    const result = await apiKeysPlugin()(config);
    const collection = result.collections.find((item) => item.slug === 'api-keys')!;
    const field = collection.fields.find((item) => 'name' in item && item.name === 'totalCostUSD');
    const find = vi
      .fn()
      .mockResolvedValue({ docs: [{ costUSD: 0.012 }, { costUSD: 0.003 }, { costUSD: null }] });

    const hook = 'hooks' in field! ? field.hooks?.afterRead?.[0] : undefined;

    expect(field).toMatchObject({
      name: 'totalCostUSD',
      label: 'Total Cost (USD)',
      type: 'number',
      virtual: true,
      admin: {
        readOnly: true,
        components: {
          Cell: '@frogbotai/ui/admin#FieldCell',
          Field: '@frogbotai/ui/admin#MoneyField',
        },
        custom: { frogbot: { kind: { type: 'money', currency: 'USD', precision: 'auto' } } },
      },
    });
    expect('jsonSchema' in field! && field.jsonSchema).toHaveLength(1);
    expect(collection.admin?.views?.[0]).toMatchObject({
      type: 'list',
      defaultFields: expect.arrayContaining(['totalCostUSD']),
    });
    await expect(
      hook?.({ data: { id: 'key-1' }, req: { frogbot: { find } } } as never),
    ).resolves.toBeCloseTo(0.015);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'usage-logs',
        pagination: false,
        where: { apiKey: { equals: 'key-1' } },
      }),
    );
  });

  it('revokes only a key owned by the current user', async () => {
    const collection = await getCollection();
    const update = vi.fn().mockResolvedValue({});
    const req = {
      user: { id: 'user-1', roles: ['member'] },
      routeParams: { id: 'key-1' },
      frogbot: {
        find: vi
          .fn()
          .mockResolvedValue({ docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1' }] }),
        update,
      },
    } as unknown as FrogBotRequest;

    const endpoint = collection.endpoints!.find((item) => item.path === '/:id/revoke')!;
    const response = await endpoint.handler(req);

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: 'key-1' }));
    expect((req.frogbot.find as ReturnType<typeof vi.fn>).mock.calls[0][0].where).toEqual({
      and: [{ id: { equals: 'key-1' } }, { owner: { equals: 'user-1' } }],
    });
  });

  it("revokes another user's key only when canRevokeAnyKey allows it", async () => {
    const collection = await getCollection({
      canRevokeAnyKey: (req) =>
        (req.user as { roles?: string[] } | null)?.roles?.includes('support') === true,
    });

    const req = {
      user: { id: 'support-1', roles: ['support'] },
      routeParams: { id: 'key-1' },
      frogbot: {
        find: vi
          .fn()
          .mockResolvedValue({ docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1' }] }),
        update: vi.fn().mockResolvedValue({}),
      },
    } as unknown as FrogBotRequest;

    const endpoint = collection.endpoints!.find((item) => item.path === '/:id/revoke')!;

    expect((await endpoint.handler(req)).status).toBe(200);
    expect((req.frogbot.find as ReturnType<typeof vi.fn>).mock.calls[0][0].where).toEqual({
      id: { equals: 'key-1' },
    });
  });

  it('rotates by revoking before minting and preserves key ownership', async () => {
    const collection = await getCollection();
    const operations: string[] = [];
    const req = {
      user: { id: 'support-1' },
      routeParams: { id: 'key-1' },
      frogbot: {
        find: vi
          .fn()
          .mockResolvedValue({ docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1' }] }),
        update: vi.fn().mockImplementation(() => {
          operations.push('revoke');

          return Promise.resolve();
        }),
        create: vi.fn().mockImplementation(() => {
          operations.push('mint');

          return Promise.resolve({ id: 'key-2', createdAt: 'now' });
        }),
      },
    } as unknown as FrogBotRequest;

    const endpoint = collection.endpoints!.find((item) => item.path === '/:id/rotate')!;
    const response = await endpoint.handler(req);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(operations).toEqual(['revoke', 'mint']);
    expect(body).toMatchObject({
      id: 'key-2',
      name: 'Deploy',
      token: expect.stringMatching(/^fb_/),
    });
    expect((req.frogbot.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data.owner).toBe(
      'user-1',
    );
  });

  it('leaves the old key revoked when rotate minting fails', async () => {
    const collection = await getCollection();
    const update = vi.fn().mockResolvedValue({});
    const req = {
      user: { id: 'user-1' },
      routeParams: { id: 'key-1' },
      frogbot: {
        find: vi
          .fn()
          .mockResolvedValue({ docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1' }] }),
        update,
        create: vi.fn().mockRejectedValue(new Error('database unavailable')),
      },
    } as unknown as FrogBotRequest;

    const endpoint = collection.endpoints!.find((item) => item.path === '/:id/rotate')!;

    await expect(endpoint.handler(req)).rejects.toThrow('database unavailable');
    expect(update).toHaveBeenCalledOnce();
  });

  it('merges an existing transformed collection and explicit overrides', async () => {
    const config = makeConfig();

    config.collections.push({
      slug: 'api-keys',
      fields: [{ name: 'tenant', type: 'text' }],
      admin: {
        views: [
          {
            type: 'list',
            defaultFields: ['name', 'tenant'],
            components: { beforeTable: ['./TenantControl.js'], afterTable: ['./Footer.js'] },
          },
        ],
      },
      access: { read: () => true },
      endpoints: [{ method: 'get', path: '/custom', handler: () => Response.json({}) }],
    });

    const result = await apiKeysPlugin({
      collection: { fields: [{ name: 'metadata', type: 'json' }] },
    })(config);

    const collection = result.collections.find((item) => item.slug === 'api-keys')!;
    const names = collection.fields.map((field) => ('name' in field ? field.name : null));

    expect(names).toEqual(expect.arrayContaining(['tokenHash', 'tenant', 'metadata']));
    expect(collection.endpoints?.map((endpoint) => endpoint.path)).toContain('/custom');
    expect(collection.admin?.views).toEqual([
      {
        type: 'list',
        defaultFields: ['name', 'tenant'],
        components: {
          beforeTable: ['./TenantControl.js'],
          afterTable: ['./Footer.js'],
          actions: [manager()],
        },
      },
    ]);
    expect(await collection.access?.read?.({ slug: 'test', req: request() })).toBe(true);
  });

  it('prefers explicit override views and injects the manager into the first list view', async () => {
    const collection = await getCollection({
      collection: {
        admin: {
          views: [
            { type: 'board', groupBy: 'owner' },
            { type: 'list', slug: 'all', components: { beforeTable: ['./Banner.js'] } },
          ],
        },
      },
    });

    expect(collection.admin?.views).toEqual([
      { type: 'board', groupBy: 'owner' },
      {
        type: 'list',
        slug: 'all',
        components: { beforeTable: ['./Banner.js'], actions: [manager()] },
      },
    ]);
  });

  it("puts the manager before an authored list view's own actions", async () => {
    const collection = await getCollection({
      collection: { admin: { views: [{ type: 'list', components: { actions: ['./Other.js'] } }] } },
    });

    expect(collection.admin?.views).toEqual([
      { type: 'list', components: { actions: [manager(), './Other.js'] } },
    ]);
  });

  it('gives the manager a custom collection slug', async () => {
    const config = await apiKeysPlugin({ collectionSlug: 'credentials' })(makeConfig());
    const collection = config.collections.find((item) => item.slug === 'credentials')!;

    expect(collection.admin?.views).toEqual([
      expect.objectContaining({ components: { actions: [manager('credentials')] } }),
    ]);
  });

  it('uses the key-round icon by default', async () => {
    const collection = await getCollection();

    expect(collection.admin?.icon).toBe('key-round');
  });

  it('prefers an explicit collection icon over the default', async () => {
    const collection = await getCollection({ collection: { admin: { icon: 'lock' } } });

    expect(collection.admin?.icon).toBe('lock');
  });

  it('keeps the icon of an existing API keys collection', async () => {
    const config = makeConfig();

    config.collections.push({ slug: 'api-keys', fields: [], admin: { icon: 'square-lock' } });

    const result = await apiKeysPlugin()(config);
    const collection = result.collections.find((item) => item.slug === 'api-keys')!;

    expect(collection.admin?.icon).toBe('square-lock');
  });
});

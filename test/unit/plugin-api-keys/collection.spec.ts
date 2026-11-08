import { APIError, type FrogBotConfig, type FrogBotRequest } from 'frogbot';
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
      'canMint',
      'mintedBy',
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

    for (const name of [
      'owner',
      'prefix',
      'tokenHash',
      'lastUsedAt',
      'revokedAt',
      'canMint',
      'mintedBy',
    ]) {
      const field = collection.fields.find((item) => 'name' in item && item.name === name);

      expect('access' in field! && field.access?.update?.({} as never)).toBe(false);
    }

    expect(collection.admin?.views).toEqual([
      {
        type: 'list',
        defaultFields: ['name', 'prefix', 'mintedBy', 'lastUsedAt', 'revokedAt', 'actions'],
      },
    ]);
    expect(
      collection.fields.find((item) => 'name' in item && item.name === 'mintedBy'),
    ).toMatchObject({ type: 'relationship', relationTo: 'api-keys' });
    expect(collection.admin?.components?.CreateButton).toEqual(manager());
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

  it('puts system-written fields in the sidebar and keeps name in the main column', async () => {
    const config = makeConfig();
    config.ai = { providers: { openai: { apiKey: 'test' } } };
    const result = await apiKeysPlugin()(config);
    const collection = result.collections.find((item) => item.slug === 'api-keys')!;
    const admin = (name: string) => {
      const field = collection.fields.find((item) => 'name' in item && item.name === name);

      return field && 'admin' in field ? field.admin : undefined;
    };

    for (const name of ['owner', 'prefix', 'lastUsedAt', 'revokedAt', 'totalCostUSD']) {
      expect(admin(name)).toMatchObject({ position: 'sidebar' });
    }

    expect(admin('revokedAt')?.condition).toBeTypeOf('function');
    expect(admin('name')?.position).toBeUndefined();
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

  it('refuses mint and rotate for API-key requests without canMint, without writing', async () => {
    const collection = await getCollection();
    const create = vi.fn();
    const update = vi.fn();
    const req = {
      user: { id: 'user-1', _strategy: 'api-key', apiKeyId: 'key-1' },
      routeParams: { id: 'key-1' },
      json: () => Promise.resolve({ name: 'Persist', data: { canMint: true } }),
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
        error:
          "This API key can't mint or rotate API keys. Sign in, or use a key that can mint keys.",
      });
    }

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('lets a canMint key mint and rotate, recording itself as mintedBy', async () => {
    const collection = await getCollection();
    const create = vi.fn().mockResolvedValue({ id: 'key-2', createdAt: 'now' });
    const update = vi.fn().mockResolvedValue({ docs: [] });
    const req = {
      user: {
        id: 'user-1',
        _strategy: 'api-key',
        apiKeyId: 'key-1',
        apiKey: { id: 'key-1', canMint: true },
      },
      routeParams: { id: 'key-3' },
      json: () => Promise.resolve({ name: 'CI', data: { canMint: true } }),
      frogbot: {
        find: vi.fn().mockResolvedValue({
          docs: [{ id: 'key-3', name: 'Old', owner: 'user-1', canMint: false, mintedBy: 'key-1' }],
        }),
        create,
        update,
      },
    } as unknown as FrogBotRequest;

    const mint = collection.endpoints!.find((item) => item.path === '/mint')!;
    const minted = await mint.handler(req);

    expect(minted.status).toBe(201);
    expect(await minted.json()).toMatchObject({ id: 'key-2', canMint: true, mintedBy: 'key-1' });
    expect(create.mock.calls[0][0].data).toMatchObject({
      name: 'CI',
      owner: 'user-1',
      canMint: true,
      mintedBy: 'key-1',
    });

    const rotate = collection.endpoints!.find((item) => item.path === '/:id/rotate')!;
    const rotated = await rotate.handler(req);

    expect(rotated.status).toBe(201);
    expect(create.mock.calls[1][0].data).toMatchObject({
      name: 'Old',
      canMint: false,
      mintedBy: 'key-1',
    });
    expect(create.mock.calls[1][0].context).toEqual({ apiKeyRotatedFrom: 'key-3' });
  });

  it('records no mintedBy for a session and refuses data that sets it', async () => {
    const collection = await getCollection();
    const create = vi.fn().mockResolvedValue({ id: 'key-2', createdAt: 'now' });
    const req = {
      user: { id: 'user-1' },
      json: () => Promise.resolve({ name: 'CI', data: { mintedBy: 'key-9' } }),
      frogbot: { create },
    } as unknown as FrogBotRequest;

    const mint = collection.endpoints!.find((item) => item.path === '/mint')!;

    expect((await mint.handler(req)).status).toBe(201);
    expect(create.mock.calls[0][0].data).toMatchObject({ canMint: false, mintedBy: null });
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
    const update = vi.fn().mockResolvedValue({ docs: [] });
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

  it.each([
    [undefined, 2],
    [{ cascade: true }, 2],
    [{ cascade: false }, 1],
  ])('reads cascade %j from the revoke body', async (body, finds) => {
    const collection = await getCollection();
    const find = vi
      .fn()
      .mockResolvedValue({ docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1' }] });

    const req = {
      user: { id: 'user-1', roles: ['member'] },
      routeParams: { id: 'key-1' },
      json: body === undefined ? undefined : () => Promise.resolve(body),
      frogbot: { find, update: vi.fn().mockResolvedValue({}) },
    } as unknown as FrogBotRequest;

    const endpoint = collection.endpoints!.find((item) => item.path === '/:id/revoke')!;

    expect((await endpoint.handler(req)).status).toBe(200);
    expect(find).toHaveBeenCalledTimes(finds);
  });

  it('refuses a revoke whose cascade is not a boolean', async () => {
    const collection = await getCollection();
    const find = vi.fn();
    const req = {
      user: { id: 'user-1', roles: ['member'] },
      routeParams: { id: 'key-1' },
      json: () => Promise.resolve({ cascade: 'no' }),
      frogbot: { find, update: vi.fn() },
    } as unknown as FrogBotRequest;

    const endpoint = collection.endpoints!.find((item) => item.path === '/:id/revoke')!;
    const response = await endpoint.handler(req);

    expect(response.status).toBe(400);
    expect(find).not.toHaveBeenCalled();
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
        update: vi.fn().mockResolvedValue({ docs: [] }),
      },
    } as unknown as FrogBotRequest;

    const endpoint = collection.endpoints!.find((item) => item.path === '/:id/revoke')!;

    expect((await endpoint.handler(req)).status).toBe(200);
    expect((req.frogbot.find as ReturnType<typeof vi.fn>).mock.calls[0][0].where).toEqual({
      id: { equals: 'key-1' },
    });
  });

  it('rotates by minting before revoking and preserves key ownership', async () => {
    const collection = await getCollection();
    const operations: string[] = [];
    const req = {
      user: { id: 'support-1' },
      routeParams: { id: 'key-1' },
      frogbot: {
        find: vi
          .fn()
          .mockResolvedValue({ docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1' }] }),
        update: vi.fn().mockImplementation((args: { id?: string }) => {
          operations.push(args.id ? 'revoke' : 'move');

          return Promise.resolve({ docs: [] });
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
    expect(operations).toEqual(['mint', 'move', 'revoke']);
    expect(body).toMatchObject({
      id: 'key-2',
      name: 'Deploy',
      token: expect.stringMatching(/^fb_/),
    });
    expect((req.frogbot.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data.owner).toBe(
      'user-1',
    );
  });

  it('leaves the old key working when rotate minting fails', async () => {
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
    expect(update).not.toHaveBeenCalled();
  });

  it("answers a refused rotation with the refusal's status and words, revoking nothing", async () => {
    const collection = await getCollection();
    const update = vi.fn();
    const req = {
      user: { id: 'user-1' },
      routeParams: { id: 'key-1' },
      frogbot: {
        find: vi
          .fn()
          .mockResolvedValue({ docs: [{ id: 'key-1', name: 'Deploy', owner: 'user-1' }] }),
        update,
        create: vi.fn().mockRejectedValue(new APIError('Over the cap.', 400)),
      },
    } as unknown as FrogBotRequest;

    const endpoint = collection.endpoints!.find((item) => item.path === '/:id/rotate')!;
    const response = await endpoint.handler(req);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Over the cap.' });
    expect(update).not.toHaveBeenCalled();
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
        },
      },
    ]);
    expect(await collection.access?.read?.({ slug: 'test', req: request() })).toBe(true);
  });

  it('keeps explicit override views as written', async () => {
    const views = [
      { type: 'board' as const, groupBy: 'owner' },
      { type: 'list' as const, slug: 'all', components: { actions: ['./Other.js'] } },
    ];

    const collection = await getCollection({ collection: { admin: { views } } });

    expect(collection.admin?.views).toEqual(views);
    expect(collection.admin?.components?.CreateButton).toEqual(manager());
  });

  it("lets an override's own CreateButton win", async () => {
    const collection = await getCollection({
      collection: { admin: { components: { CreateButton: './Mine.js' } } },
    });

    expect(collection.admin?.components?.CreateButton).toBe('./Mine.js');
  });

  it('gives the manager a custom collection slug', async () => {
    const config = await apiKeysPlugin({ collectionSlug: 'credentials' })(makeConfig());
    const collection = config.collections.find((item) => item.slug === 'credentials')!;

    expect(collection.admin?.components?.CreateButton).toEqual(manager('credentials'));
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

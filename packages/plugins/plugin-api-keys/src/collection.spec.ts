import type { FrogbotConfig, FrogbotRequest } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import { apiKeysPlugin } from './index.js';

function makeConfig(): FrogbotConfig {
  return {
    secret: 'test',
    db: {} as FrogbotConfig['db'],
    collections: [{ slug: 'users', auth: true, fields: [] }],
  };
}

async function getCollection() {
  const config = await apiKeysPlugin()(makeConfig());
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
    ]);
    expect(await collection.access?.read?.({ req: { user: { id: 'user-1' } } as FrogbotRequest })).toEqual({
      owner: { equals: 'user-1' },
    });
    expect(await collection.access?.create?.({ req: {} as FrogbotRequest })).toBe(false);
    expect(collection.admin?.components?.beforeListTable).toContain(
      '@frogbotai/plugin-api-keys/client#ApiKeysManager',
    );
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
    } as unknown as FrogbotRequest;
    const endpoint = collection.endpoints!.find((item) => item.path === '/mint')!;
    const first = await endpoint.handler(req);
    const second = await endpoint.handler(req);
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.status).toBe(201);
    expect(firstBody.token).not.toBe(secondBody.token);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('token');
    expect(create.mock.calls[0][0].data.tokenHash).toHaveLength(64);
  });

  it('revokes only a key owned by the current user', async () => {
    const collection = await getCollection();
    const update = vi.fn().mockResolvedValue({});
    const req = {
      user: { id: 'user-1' },
      routeParams: { id: 'key-1' },
      frogbot: {
        find: vi.fn().mockResolvedValue({ docs: [{ id: 'key-1', owner: 'user-1' }] }),
        update,
      },
    } as unknown as FrogbotRequest;
    const endpoint = collection.endpoints!.find((item) => item.path === '/:id/revoke')!;
    const response = await endpoint.handler(req);

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: 'key-1' }));
    expect((req.frogbot.find as ReturnType<typeof vi.fn>).mock.calls[0][0].where).toEqual({
      and: [{ id: { equals: 'key-1' } }, { owner: { equals: 'user-1' } }],
    });
  });

  it('merges an existing transformed collection and explicit overrides', async () => {
    const config = makeConfig();
    config.collections.push({
      slug: 'api-keys',
      fields: [{ name: 'tenant', type: 'text' }],
      admin: { components: { beforeListTable: ['./TenantControl.js'] } },
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
    expect(collection.admin?.components?.beforeListTable).toEqual([
      '@frogbotai/plugin-api-keys/client#ApiKeysManager',
      './TenantControl.js',
    ]);
    expect(await collection.access?.read?.({ req: {} as FrogbotRequest })).toBe(true);
  });
});

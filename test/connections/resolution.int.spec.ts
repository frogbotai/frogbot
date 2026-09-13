import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { type Endpoint, getPayload, type Payload } from 'payload';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { buildConfig } from '../../packages/frogbot/src/config/build.js';
import { getPayloadConfig } from '../../packages/frogbot/src/config/getPayloadConfig.js';
import type {
  ConnectionOwner,
  ConnectionRow,
  ConnectionStore,
} from '../../packages/frogbot/src/connections/store.js';
import { Frogbot } from '../../packages/frogbot/src/frogbot.js';
import { definePiece } from '../../packages/frogbot/src/pieces/definePiece.js';
import type { FrogbotRequest } from '../../packages/frogbot/src/types/request.js';
import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';

const client = vi.fn(({ auth }) => ({ token: auth.token.value }));
const createPiece = definePiece({
  slug: 'example',
  label: 'Example',
  auth: z.object({
    token: z
      .string()
      .min(1)
      .transform((value) => ({ value })),
  }),
  client,
  oauth: {
    authorizationUrl: 'https://example.com/authorize',
    tokenUrl: 'https://example.com/token',
    scopes: [],
    toAuth: ({ tokens }) => ({ token: tokens.access_token }),
  },
  actions: [
    {
      slug: 'read',
      description: 'Read',
      input: z.object({}),
      async run({ client }) {
        return client.token;
      },
    },
  ],
});

describe(`connection resolution and static routes [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let frogbot: Frogbot;
  let payload: Payload;
  let store: ConnectionStore;
  let owner: ConnectionOwner;
  let other: ConnectionOwner;
  let endpoints: Endpoint[];
  const piece = createPiece({
    slug: 'custom-alias',
    auth: { token: 'factory' },
    oauth: { clientId: 'id', clientSecret: 'secret' },
  });
  const request = (user: ConnectionOwner | null = owner): FrogbotRequest =>
    ({ frogbot, payload, user }) as unknown as FrogbotRequest;
  const link = (body: unknown, user = owner) =>
    endpoints[0]!.handler({
      ...request(user),
      routeParams: { piece: 'example' },
      json: async () => body,
    } as never);
  const remove = (id: number | string, user = owner) =>
    endpoints[1]!.handler({
      ...request(user),
      routeParams: { id: String(id) },
    } as never);

  beforeAll(async () => {
    const config = await buildConfig({
      secret: 'connection-resolution-test-secret',
      db: await getTestDatabaseAdapter({
        sqlite: sqliteAdapter({ client: { url: 'file::memory:' } }),
      }),
      admin: { user: 'members', importMap: { autoGenerate: false } },
      typescript: { autoGenerate: false },
      collections: [
        { slug: 'members', auth: true, fields: [] },
        { slug: 'customers', auth: true, fields: [] },
      ],
      connections: [{ piece, oauth: true, secret: true }],
    });
    frogbot = await new Frogbot().init({ config, disableOnInit: true });
    store = await frogbot.connections.store;
    payload = await getPayload({ config: await getPayloadConfig(config) });
    const registered = payload.collections.connections.config.endpoints;
    if (!registered) throw new Error('Connection endpoints are missing');
    endpoints = [
      registered.find(({ method, path }) => method === 'post' && path === '/:piece')!,
      registered.find(({ method, path }) => method === 'delete' && path === '/:id')!,
    ];
    const first = await frogbot.create({
      collection: 'members',
      data: { email: 'first@example.com', password: 'password' },
    });
    const second = await frogbot.create({
      collection: 'members',
      data: { email: 'second@example.com', password: 'password' },
    });
    owner = { id: first.id, collection: 'members' };
    other = { id: second.id, collection: 'members' };
  });

  afterAll(async () => {
    await frogbot?.destroy();
  });
  beforeEach(async () => {
    await frogbot.delete({ collection: 'connections', where: {}, overrideAccess: true });
    client.mockClear();
  });

  it('wires only canonical static and delete routes', async () => {
    const config = await getPayloadConfig(frogbot.config);
    expect(config.collections.find(({ slug }) => slug === 'connections')?.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'post', path: '/:piece' }),
        expect.objectContaining({ method: 'delete', path: '/:id' }),
      ]),
    );
    expect(config.collections.find(({ slug }) => slug === 'connections')?.endpoints).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '/secret' })]),
    );
  });

  it('links raw input, encrypts every field, and invokes the native action as the user', async () => {
    const req = request();
    expect(await piece.read({ input: {}, req })).toBe('factory');
    const response = await link({ token: 'user-secret' });
    expect(response.status).toBe(200);
    const metadata = await response.json();
    expect(metadata).toMatchObject({
      owner: owner.id,
      piece: 'example',
      method: 'secret',
      status: 'active',
    });
    expect(JSON.stringify(metadata)).not.toContain('user-secret');
    expect(metadata).not.toHaveProperty('credential');
    const raw = await frogbot.db.find<ConnectionRow>({
      collection: 'connections',
      pagination: false,
    });
    expect(raw.docs[0].credential).toMatch(/^v1\./);
    expect(raw.docs[0].credential).not.toContain('user-secret');
    expect(await piece.read({ input: {}, req })).toBe('user-secret');
    expect(await frogbot.connections.resolve({ piece, req })).toEqual({
      token: { value: 'user-secret' },
    });
    expect(await piece.read({ input: {}, req: request(other) })).toBe('factory');
    expect(await piece.read({ input: {}, req: request(null) })).toBe('factory');
  });

  it('replaces in place, retaining the client only when the credential is unchanged', async () => {
    const first = await (await link({ token: 'first' })).json();
    const initialClient = await piece.client({ req: request() });
    const same = await (await link({ token: 'first' })).json();
    expect(same.id).toBe(first.id);
    expect(await piece.client({ req: request() })).toBe(initialClient);
    const next = await (await link({ token: 'next' })).json();
    expect(next.id).toBe(first.id);
    expect(await piece.client({ req: request() })).not.toBe(initialClient);
    expect(await piece.read({ input: {}, req: request() })).toBe('next');
    expect(client).toHaveBeenCalledTimes(2);
  });

  it('replaces OAuth with a static credential and clears token metadata', async () => {
    const row = await store.upsert({
      owner,
      piece: 'example',
      method: 'oauth',
      credential: { access_token: 'oauth-token' },
      scopes: ['read'],
      account: { id: 'remote', label: 'Remote' },
      expiresAt: '2100-01-01T00:00:00Z',
    });
    expect(await piece.read({ input: {}, req: request() })).toBe('oauth-token');
    const response = await link({ token: 'static-token' });
    expect(await response.json()).toMatchObject({
      id: row.id,
      method: 'secret',
      scopes: [],
      account: null,
      expiresAt: null,
    });
    expect(await piece.read({ input: {}, req: request() })).toBe('static-token');
  });

  it('does not replace a row with malformed credentials or leak validation input', async () => {
    await link({ token: 'valid-secret' });
    for (const body of [{ token: 42 }, { credential: { token: 'private' } }, {}]) {
      const response = await link(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Invalid credentials' });
    }
    expect(await piece.read({ input: {}, req: request() })).toBe('valid-secret');
  });

  it('enforces owner collection and ID for resolution, linking, listing, and deletion', async () => {
    const row = await (await link({ token: 'owner-secret' })).json();
    const customer = { ...owner, collection: 'customers' };
    expect(await piece.read({ input: {}, req: request(customer) })).toBe('factory');
    expect((await link({ token: 'attacker' }, customer)).status).toBe(403);
    expect((await remove(row.id, customer)).status).toBe(403);
    expect((await remove(row.id, other)).status).toBe(404);
    await expect(frogbot.connections.list({ req: request(customer) })).rejects.toThrow(
      'admin user collection',
    );
    expect(await frogbot.connections.list({ req: request(other) })).toEqual([]);
    expect((await remove(row.id)).status).toBe(204);
    expect(await piece.read({ input: {}, req: request() })).toBe('factory');
    expect((await remove(row.id)).status).toBe(404);
  });

  it.each([
    [{ status: 'revoked' as const }, 'revoked'],
    [{ status: 'error' as const }, 'error'],
    [{ expiresAt: '2000-01-01T00:00:00Z' }, 'expired'],
    [{ credential: { wrong: 'private' } }, 'error'],
  ])('blocks existing unusable rows without factory fallback: %j', async (data, code) => {
    await store.upsert({
      owner,
      piece: 'example',
      method: 'secret',
      credential: { token: 'user' },
      ...data,
    });
    await expect(piece.read({ input: {}, req: request() })).rejects.toMatchObject({
      name: 'ConnectionError',
      code,
      piece: 'example',
    });
    expect(client).not.toHaveBeenCalled();
  });
});

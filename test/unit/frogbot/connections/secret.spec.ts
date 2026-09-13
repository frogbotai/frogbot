import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createCredentialEncryption } from '../../../../packages/frogbot/src/connections/encryption.js';
import { buildSecretEndpoints } from '../../../../packages/frogbot/src/connections/secret.js';
import { KVLockContentionError } from '../../../../packages/frogbot/src/kv/errors.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';

function setup(auth = z.object({ token: z.string().min(1) })) {
  const piece = definePiece({
    slug: 'example',
    label: 'Example',
    auth,
    client: () => ({}),
    actions: [],
  })({ slug: 'alias' });
  const upsert = vi
    .fn()
    .mockResolvedValue({ id: 'row', piece: 'example', method: 'secret', status: 'active' });
  const remove = vi.fn().mockResolvedValue(true);
  const connections = {
    enabled: true,
    slug: 'connections',
    encryption: createCredentialEncryption({ secret: 'test' }),
    entries: { example: { piece, secret: true, oauth: false } },
  };
  const endpoints = buildSecretEndpoints({ connections, userSlug: 'users' });
  const request = ({
    body = { token: 'secret-value' },
    user = { id: 'owner', collection: 'users' },
    routeParams = { piece: 'example' } as Record<string, unknown>,
  } = {}) =>
    ({
      user,
      routeParams,
      json: async () => body,
      frogbot: { connections: { store: Promise.resolve({ upsert }), delete: remove } },
    }) as never;
  return { upsert, remove, request, endpoints, connections };
}

describe('static connection endpoints', () => {
  it('accepts raw schema input and returns metadata without secrets', async () => {
    const { endpoints, request, upsert } = setup();
    const response = await endpoints[0]!.handler(request());
    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith({
      owner: { id: 'owner', collection: 'users' },
      piece: 'example',
      method: 'secret',
      credential: { token: 'secret-value' },
    });
    expect(await response.json()).toEqual({
      id: 'row',
      piece: 'example',
      method: 'secret',
      status: 'active',
    });
  });

  it.each([{}, { credential: { token: 'secret-value' } }, { token: 42 }, null, []])(
    'rejects malformed raw input %j',
    async (body) => {
      const { endpoints, request, upsert } = setup();
      const response = await endpoints[0]!.handler(request({ body: body as never }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Invalid credentials' });
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('redacts thrown schema errors', async () => {
    const { endpoints, request } = setup(
      z.object({
        token: z.string().refine(() => {
          throw new Error('secret-value');
        }),
      }),
    );
    const response = await endpoints[0]!.handler(request());
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('secret-value');
  });

  it('rejects malformed JSON', async () => {
    const { endpoints, request } = setup();
    const req = {
      ...(request() as object),
      json: async () => {
        throw new Error('secret-value');
      },
    };
    expect((await endpoints[0]!.handler(req as never)).status).toBe(400);
  });

  it.each([null, { id: 'owner', collection: 'customers' }])(
    'protects both endpoints from %j',
    async (user) => {
      const { endpoints, request, upsert, remove } = setup();
      for (const endpoint of endpoints) {
        expect((await endpoint.handler(request({ user: user as never }))).status).toBe(
          user ? 403 : 401,
        );
      }
      expect(upsert).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it.each(['alias', 'unknown', '__proto__'])(
    'rejects a noncanonical or unknown piece %s',
    async (piece) => {
      const { endpoints, request, upsert } = setup();
      expect((await endpoints[0]!.handler(request({ routeParams: { piece } }))).status).toBe(404);
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('rejects a disabled secret method and omits routes when connections are disabled', async () => {
    const { endpoints, request, connections } = setup();
    connections.entries.example.secret = false;
    expect((await endpoints[0]!.handler(request())).status).toBe(404);
    expect(
      buildSecretEndpoints({ connections: { ...connections, enabled: false }, userSlug: 'users' }),
    ).toEqual([]);
  });

  it('deletes by ID through the owner-scoped API', async () => {
    const { endpoints, request, remove } = setup();
    const req = request({ routeParams: { id: 'row' } });
    expect((await endpoints[1]!.handler(req)).status).toBe(204);
    expect(remove).toHaveBeenCalledWith({ req, id: 'row' });
    remove.mockResolvedValue(false);
    expect((await endpoints[1]!.handler(req)).status).toBe(404);
  });

  it('redacts persistence errors', async () => {
    const { endpoints, request, upsert } = setup();
    upsert.mockRejectedValue(new Error('secret-value'));
    const response = await endpoints[0]!.handler(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Connection operation failed' });
  });

  it('reports lock contention without leaking the lock key', async () => {
    const { endpoints, request, upsert } = setup();
    upsert.mockRejectedValue(new KVLockContentionError('private-owner-key'));
    const response = await endpoints[0]!.handler(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Connection is busy' });
  });
});

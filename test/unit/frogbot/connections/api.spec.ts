import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { Connections } from '../../../../packages/frogbot/src/connections/api.js';
import { createCredentialEncryption } from '../../../../packages/frogbot/src/connections/encryption.js';
import type { ConnectionRow } from '../../../../packages/frogbot/src/connections/store.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import type { PieceDefinition } from '../../../../packages/frogbot/src/pieces/types.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

const definition = {
  slug: 'example',
  label: 'Example',
  auth: z.object({ token: z.string().min(1) }),
  client: ({ auth }) => ({ auth }),
  oauth: {
    authorizationUrl: 'https://example.com/authorize',
    tokenUrl: 'https://example.com/token',
    scopes: ['read'],
    toAuth: ({ tokens }) => ({ token: tokens.access_token }),
  },
  actions: [],
} satisfies PieceDefinition;

async function setup({
  row,
  auth,
  oauth = true,
  secret = true,
  pieceDefinition = definition,
}: {
  row?: Partial<ConnectionRow> & { value?: unknown };
  auth?: { token: string };
  oauth?: boolean;
  secret?: boolean;
  pieceDefinition?: PieceDefinition;
} = {}) {
  const factory = definePiece(pieceDefinition);
  const piece = factory({ slug: 'alias', ...(auth ? { auth } : {}) });
  const encryption = createCredentialEncryption({ secret: 'test' });
  const stored = row
    ? {
        id: 'connection',
        owner: 'owner',
        piece: 'example',
        method: 'secret',
        status: 'active',
        scopes: [],
        createdAt: '',
        updatedAt: '',
        credential: await encryption.encrypt(JSON.stringify(row.value ?? { token: 'user' })),
        ...row,
      }
    : undefined;
  const find = vi.fn(async () => ({ docs: stored ? [stored] : [] }));
  const frogbot = {
    find,
    config: {
      _internal: {
        payloadConfig: Promise.resolve({
          admin: { user: 'users' },
          routes: { api: '/custom-api' },
        }),
      },
    },
  };
  const api = new Connections(frogbot as never, {
    enabled: true,
    slug: 'connections',
    encryption,
    entries: { example: { piece, oauth, secret } },
  });
  const req = { user: { id: 'owner', collection: 'users' }, frogbot } as unknown as FrogBotRequest;
  Object.assign(frogbot, { connections: api });
  return { api, req, piece, factory, stored, encryption, find };
}

describe('connections API', () => {
  it('resolves a canonical user row before factory auth', async () => {
    const { api, req, piece, find } = await setup({ auth: { token: 'factory' }, row: {} });
    await expect(api.resolve({ piece, req })).resolves.toEqual({ token: 'user' });
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { and: [{ owner: { equals: 'owner' } }, { piece: { equals: 'example' } }] },
      }),
    );
  });

  it.each([undefined, null, { id: 'owner', collection: 'customers' }, { id: 'owner' }])(
    'never aliases an absent or ineligible owner to an admin owner: %j',
    async (user) => {
      const { api, req, piece, find } = await setup({ auth: { token: 'factory' }, row: {} });
      req.user = user as never;
      await expect(api.resolve({ piece, req })).resolves.toEqual({ token: 'factory' });
      expect(find).not.toHaveBeenCalled();
    },
  );

  it('falls back only when no row exists and errors without factory auth', async () => {
    const { api, req, piece, factory } = await setup({ auth: { token: 'factory' } });
    await expect(api.resolve({ piece, req })).resolves.toEqual({ token: 'factory' });
    await expect(api.resolve({ piece: factory(), req })).rejects.toMatchObject({
      name: 'ConnectionError',
      code: 'missing',
      piece: 'example',
    });
  });

  it.each([
    [{ status: 'revoked' }, 'revoked'],
    [{ status: 'error' }, 'error'],
    [{ expiresAt: '2000-01-01T00:00:00Z' }, 'expired'],
    [{ expiresAt: 'invalid' }, 'error'],
    [{ value: { token: 123 } }, 'error'],
    [{ value: 'secret-value' }, 'error'],
    [{ credential: 'broken-ciphertext' }, 'error'],
    [{ method: 'legacy' }, 'error'],
  ])('never falls back for an unusable existing row %j', async (row, code) => {
    const { api, req, piece } = await setup({ auth: { token: 'factory' }, row: row as never });
    await expect(api.resolve({ piece, req })).rejects.toMatchObject({
      name: 'ConnectionError',
      code,
    });
  });

  it('rejects disabled stored methods', async () => {
    const { api, req, piece } = await setup({ secret: false, row: {}, auth: { token: 'factory' } });
    await expect(api.resolve({ piece, req })).rejects.toMatchObject({ code: 'error' });
  });

  it('converts OAuth tokens through the recipe and checks required scopes', async () => {
    const { api, req, piece } = await setup({
      row: {
        method: 'oauth',
        value: { access_token: 'oauth-token' },
        scopes: ['read'],
      },
    });
    await expect(api.resolve({ piece, req })).resolves.toEqual({ token: 'oauth-token' });
    await expect(
      api.resolve({ piece, req, scopes: ['read', 'write', 'write'] }),
    ).rejects.toMatchObject({
      code: 'scopes',
      missingScopes: ['write'],
      piece: 'example',
    });
  });

  it('uses the default OAuth mapping when toAuth is absent', async () => {
    const { api, req, piece } = await setup({
      pieceDefinition: {
        ...definition,
        auth: z.object({ accessToken: z.string() }),
        oauth: { ...definition.oauth, toAuth: undefined },
      },
      row: { method: 'oauth', value: { access_token: 'oauth-token' }, scopes: ['read'] },
    });
    await expect(api.resolve({ piece, req })).resolves.toEqual({ accessToken: 'oauth-token' });
  });

  it('redacts conversion and schema exceptions', async () => {
    for (const pieceDefinition of [
      {
        ...definition,
        oauth: {
          ...definition.oauth,
          toAuth: () => {
            throw new Error('secret-value');
          },
        },
      },
      {
        ...definition,
        auth: z.object({
          token: z.string().refine(() => {
            throw new Error('secret-value');
          }),
        }),
      },
    ]) {
      const { api, req, piece } = await setup({
        pieceDefinition,
        row: { method: 'oauth', value: { access_token: 'secret-value' }, scopes: ['read'] },
      });
      const error = await api.resolve({ piece, req }).catch((error: unknown) => error);
      expect(error).toMatchObject({ name: 'ConnectionError', code: 'error' });
      expect(String(error)).not.toContain('secret-value');
    }
  });

  it('keeps credential identity across reads, re-encryption, and metadata updates', async () => {
    const { api, req, piece, stored, encryption } = await setup({
      row: { value: { token: 'one', extra: 'same' } },
    });
    const first = await api.resolvePieceCredential({ piece, req });
    stored!.credential = await encryption.encrypt(JSON.stringify({ extra: 'same', token: 'one' }));
    stored!.updatedAt = '2030-01-01T00:00:00Z';
    stored!.scopes = ['read'];
    const second = await api.resolvePieceCredential({ piece, req });
    expect(second.key).toBe(first.key);
    stored!.credential = await encryption.encrypt(JSON.stringify({ token: 'two' }));
    const third = await api.resolvePieceCredential({ piece, req });
    expect(third.key).not.toBe(first.key);
    expect(third.auth).toEqual({ token: 'two' });
  });

  it('reuses native clients until credentials change', async () => {
    const client = vi.fn(({ auth }) => ({ auth }));
    const { req, piece, stored, encryption } = await setup({
      row: {},
      pieceDefinition: { ...definition, client },
    });
    const first = await piece.client({ req });
    expect(await piece.client({ req: { ...req } })).toBe(first);
    stored!.credential = await encryption.encrypt(JSON.stringify({ token: 'next' }));
    expect(await piece.client({ req })).not.toBe(first);
    expect(client).toHaveBeenCalledTimes(2);
  });

  it('bounds resident credential identities to 512 and evicts the least recently used client', async () => {
    const { api, req, piece, stored } = await setup({ row: {} });
    const resolve = async (id: string) => {
      stored!.owner = id;
      return piece.client({ req: { ...req, user: { id, collection: 'users' } } });
    };
    const first = await resolve('owner-0');
    const second = await resolve('owner-1');
    for (let i = 2; i < 512; i++) await resolve(`owner-${i}`);
    expect(api).toHaveProperty('credentialKeys.size', 512);
    expect(await resolve('owner-0')).toBe(first);
    await resolve('owner-512');
    expect(api).toHaveProperty('credentialKeys.size', 512);
    expect(await resolve('owner-0')).toBe(first);
    expect(await resolve('owner-1')).not.toBe(second);
    expect(api).toHaveProperty('credentialKeys.size', 512);
  });

  it('drops a disappeared owner/piece identity before factory fallback', async () => {
    const { api, req, piece, find } = await setup({ row: {}, auth: { token: 'factory' } });
    const first = await piece.client({ req });
    find.mockResolvedValueOnce({ docs: [] });
    expect(await piece.client({ req })).toEqual({ auth: { token: 'factory' } });
    expect(api).toHaveProperty('credentialKeys.size', 0);
    expect(await piece.client({ req })).not.toBe(first);
  });

  it('replaces an owner/piece identity when the stored row changes', async () => {
    const { api, req, piece, stored } = await setup({ row: {} });
    const first = await piece.client({ req });
    stored!.id = 'replacement';
    expect(await piece.client({ req })).not.toBe(first);
    expect(api).toHaveProperty('credentialKeys.size', 1);
    stored!.id = 'connection';
    expect(await piece.client({ req })).not.toBe(first);
    expect(api).toHaveProperty('credentialKeys.size', 1);
  });

  it('prunes disappeared rows on listing without dropping other owners', async () => {
    const { api, req, piece, find } = await setup({ row: {} });
    const first = await piece.client({ req });
    const otherReq = { ...req, user: { id: 'other-owner', collection: 'users' } };
    const other = await piece.client({ req: otherReq });
    find.mockResolvedValueOnce({ docs: [] });
    expect(await api.list({ req })).toEqual([]);
    expect(api).toHaveProperty('credentialKeys.size', 1);
    expect(await piece.client({ req: otherReq })).toBe(other);
    expect(await piece.client({ req })).not.toBe(first);
  });

  it('releases the credential identity after deleting its connection', async () => {
    const { api, req, piece } = await setup({ row: {} });
    const first = await piece.client({ req });
    vi.spyOn(await api.store, 'delete').mockResolvedValue(true);
    expect(await api.delete({ req, id: 'connection' })).toBe(true);
    expect(api).toHaveProperty('credentialKeys.size', 0);
    expect(await piece.client({ req })).not.toBe(first);
  });

  it('keeps factory client identity per instance and supports absent users', async () => {
    const { req, piece, factory } = await setup({ auth: { token: 'factory' } });
    req.user = undefined as never;
    const first = await piece.client({ req });
    expect(await piece.client({ req })).toBe(first);
    expect(await factory({ auth: { token: 'factory' } }).client({ req })).not.toBe(first);
  });

  it('reports canonical pieces and both linking methods with the configured API path', async () => {
    const { api, req, piece } = await setup();
    expect(await api.authorizations({ pieces: [piece, piece], req })).toEqual([
      {
        piece: 'example',
        oauth: true,
        secret: true,
        scopes: ['read'],
        authorizeUrl: '/custom-api/connections/example/authorize',
      },
    ]);
    const factory = await setup({ auth: { token: 'factory' } });
    expect(await factory.api.authorizations({ pieces: [factory.piece], req: factory.req })).toEqual(
      [],
    );
  });

  it('offers relinking for failed rows even with factory auth', async () => {
    const { api, req, piece } = await setup({
      auth: { token: 'factory' },
      oauth: false,
      row: { status: 'error' },
    });
    expect(await api.authorizations({ pieces: [piece], req })).toEqual([
      {
        piece: 'example',
        oauth: false,
        secret: true,
        scopes: [],
      },
    ]);
  });

  it('denies metadata and deletion to non-admin auth collection owners', async () => {
    const { api, req, find } = await setup({ row: {} });
    req.user = { id: 'owner', collection: 'customers' } as never;
    await expect(api.list({ req })).rejects.toThrow('admin user collection');
    await expect(api.delete({ req, id: 'connection' })).rejects.toThrow('admin user collection');
    expect(find).not.toHaveBeenCalled();
  });
});

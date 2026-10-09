import { vi } from 'vitest';
import { z } from 'zod';

import { Connections } from '../../../../../packages/frogbot/src/connections/api.js';
import { createCredentialEncryption } from '../../../../../packages/frogbot/src/connections/encryption.js';
import type { ConnectionRow } from '../../../../../packages/frogbot/src/connections/store.js';
import { createKV } from '../../../../../packages/frogbot/src/kv/index.js';
import { kvAtomic, type KVLock } from '../../../../../packages/frogbot/src/kv/types.js';
import { definePiece } from '../../../../../packages/frogbot/src/pieces/definePiece.js';
import type { PieceDefinition } from '../../../../../packages/frogbot/src/pieces/types.js';
import type { FrogBotRequest } from '../../../../../packages/frogbot/src/types/request.js';

export const definition = {
  slug: 'example',
  label: 'Example',
  auth: z.object({ token: z.string().min(1) }),
  options: z.object({ region: z.string().default('west') }),
  client: ({ auth, options }: { auth: unknown; options: object }) => ({ auth, options }),
  oauth: {
    authorizationUrl: 'https://provider.test/authorize',
    tokenUrl: 'https://provider.test/token',
    scopes: { catalog: { read: 'read' }, defaults: ['read'] },
    pkce: true,
    toAuth: ({ tokens }) => ({ token: tokens.access_token }),
  },
  actions: [] as const,
} satisfies PieceDefinition;

export function memoryKV() {
  const values = new Map<string, unknown>();
  const expirations = new Map<string, number>();
  const has = (key: string) => {
    if ((expirations.get(key) ?? Infinity) <= Date.now()) values.delete(key);

    return values.has(key);
  };

  const adapter = {
    [kvAtomic]: true,
    get: (key: string) => Promise.resolve(has(key) ? values.get(key) : undefined),
    setIfAbsent: vi.fn((key: string, value: unknown, { ttl }: { ttl: number }) => {
      if (has(key)) return Promise.resolve(false);
      values.set(key, value);
      expirations.set(key, Date.now() + ttl);

      return Promise.resolve(true);
    }),
    extendLock: vi.fn(({ key, token }: KVLock, ttl: number) => {
      if (!has(key) || values.get(key) !== token) return Promise.resolve(false);
      expirations.set(key, Date.now() + ttl);

      return Promise.resolve(true);
    }),
    releaseLock: vi.fn(({ key, token }: KVLock) => {
      if (!has(key) || values.get(key) !== token) return Promise.resolve(false);

      return Promise.resolve(values.delete(key));
    }),
  };

  return { kv: createKV({ adapter: adapter as never }), adapter, values, expirations };
}

type OAuthPieceDefinition = PieceDefinition & {
  oauth: NonNullable<PieceDefinition['oauth']>;
  actions: readonly [];
};

export function setup(
  pieceDefinition: OAuthPieceDefinition = definition,
  oauth = { clientId: 'client', clientSecret: 'secret' },
) {
  const piece = definePiece(pieceDefinition)({
    slug: 'configured',
    oauth,
    auth: { token: 'developer' },
  });

  const encryption = createCredentialEncryption({ secret: 'state-secret' });
  const memory = memoryKV();
  const user: FrogBotRequest['user'] = { id: 'owner', collection: 'users' };
  const req = { headers: new Headers(), user } as FrogBotRequest;
  const binding = {
    flow: 'link' as const,
    collection: 'users',
    piece,
    callbackUrl: 'https://app.test/api/connections/example/callback',
    cookiePrefix: 'frogbot',
  };

  return { ...memory, encryption, req, piece, binding };
}

export async function connectionSetup(pieceDefinition: OAuthPieceDefinition = definition) {
  const fixture = setup(pieceDefinition);
  const { encryption, piece, req, kv } = fixture;
  let row: ConnectionRow | undefined = {
    id: 'row',
    owner: 'owner',
    piece: 'example',
    method: 'oauth',
    status: 'active',
    credential: await encryption.encrypt(
      JSON.stringify({
        access_token: 'old',
        refresh_token: 'refresh',
        expires_in: 1,
        scope: 'read',
        vendor: { tenant: 'one' },
      }),
    ),
    scopes: ['read'],
    expiresAt: '2000-01-01T00:00:00Z',
    createdAt: '',
    updatedAt: '',
  };

  const frogbot = {
    kv,
    config: {
      _internal: {
        payloadConfig: Promise.resolve({ admin: { user: 'users' }, routes: { api: '/api' } }),
      },
    },
    find: vi.fn(() => Promise.resolve({ docs: row ? [row] : [] })),
    update: vi.fn(({ data }: { data: Partial<ConnectionRow> }) => {
      row = { ...row!, ...data };

      return Promise.resolve(row);
    }),
    create: vi.fn(({ data }: { data: Omit<ConnectionRow, 'id'> }) => {
      row = { ...data, id: 'created' };

      return Promise.resolve(row);
    }),
    delete: vi.fn(() => {
      row = undefined;

      return Promise.resolve();
    }),
  };

  const config = {
    enabled: true,
    slug: 'connections',
    encryption,
    entries: { example: { piece, oauth: true, secret: true } },
  };

  const api = new Connections(frogbot as never, config);
  Object.assign(frogbot, { connections: api });
  Object.assign(req, { frogbot });

  return {
    ...fixture,
    api,
    frogbot,
    config,
    row: () => row,
    replace: (next: ConnectionRow | undefined) => {
      row = next;
    },
  };
}

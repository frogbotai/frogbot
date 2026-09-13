import { ValidationError } from 'payload';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { resolveSignInIdentity } from '../../../../packages/frogbot/src/auth/signIn/identity.js';
import { sanitize } from '../../../../packages/frogbot/src/config/sanitize.js';
import type { FrogbotConfig } from '../../../../packages/frogbot/src/config/types.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import type { FrogbotRequest } from '../../../../packages/frogbot/src/types/request.js';
import { memoryKV } from '../connections/oauth/fixtures.js';

const oauth = { clientId: 'client', clientSecret: 'private-app-secret' };
const createIdentity = definePiece({
  slug: 'identity',
  label: 'Identity',
  auth: z.object({ access_token: z.string() }),
  client: ({ auth }) => auth,
  oauth: {
    authorizationUrl: 'https://identity.example/authorize',
    tokenUrl: 'https://identity.example/token',
    scopes: ['email'],
    account: async () => ({ id: 'account', label: 'Account', email: 'person@example.com' }),
  },
  actions: [],
});
const method = createIdentity({ oauth, slug: 'work' });
const config = (auth: unknown = { signIn: [method] }, fields: unknown[] = []): FrogbotConfig => ({
  secret: 'test-secret',
  db: {} as FrogbotConfig['db'],
  collections: [{ slug: 'users', auth, fields }] as FrogbotConfig['collections'],
});

describe('collection sign-in configuration', () => {
  it('wires native methods, scoped endpoints and safe admin metadata without a connection collection', async () => {
    const result = sanitize({
      ...config(),
      admin: { user: 'users', components: { afterLogin: ['custom#AfterLogin'] } },
      collections: [
        ...config().collections,
        { slug: 'customers', auth: { signIn: [method] }, fields: [] },
      ],
    });
    const built = await result._internal.payloadConfig;
    for (const slug of ['users', 'customers']) {
      const collection = built.collections.find((entry) => entry.slug === slug)!;
      expect(collection.auth).not.toHaveProperty('signIn');
      expect(collection.auth.disableLocalStrategy).toBeFalsy();
      expect(collection.custom.frogbot.signIn).toEqual([
        { slug: 'work', piece: 'identity', label: 'Identity' },
      ]);
      expect(collection.endpoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: '/sign-in/:piece', method: 'get' }),
          expect.objectContaining({ path: '/sign-in/:piece/callback', method: 'get' }),
        ]),
      );
      expect(JSON.stringify(collection.custom)).not.toContain(oauth.clientSecret);
    }
    expect(built.admin.components.afterLogin).toEqual([
      'custom#AfterLogin',
      '@frogbotai/next/rsc#SignInButtons',
    ]);
    expect(result.connections.enabled).toBe(false);
    expect(built.collections.some(({ slug }) => slug === 'connections')).toBe(false);
  });

  it('does not add admin buttons for another collection’s methods', async () => {
    const result = sanitize({
      ...config(true),
      admin: { user: 'users' },
      collections: [
        ...config(true).collections,
        { slug: 'customers', auth: { signIn: [method] }, fields: [] },
      ],
    });
    expect((await result._internal.payloadConfig).admin.components.afterLogin ?? []).not.toContain(
      '@frogbotai/next/rsc#SignInButtons',
    );
  });

  it.each([
    [{ signIn: {} }, 'array'],
    [{ signIn: [method, method] }, 'duplicate'],
    [{ signIn: [{}] }, 'piece instances'],
    [{ signIn: [createIdentity({})] }, 'factory OAuth'],
    [{ signIn: [method], disableLocalStrategy: true }, 'enableFields'],
    [{ signIn: [method], disableLocalStrategy: { optionalPassword: true } }, 'enableFields'],
    [{ signIn: [method], loginWithUsername: { allowEmailLogin: false } }, 'unique email'],
  ])('rejects incompatible auth %j', (auth, message) => {
    expect(() => sanitize(config(auth))).toThrow(message);
  });

  it('rejects a recipe without account lookup', () => {
    const piece = definePiece({
      slug: 'no-account',
      label: 'No account',
      actions: [],
      auth: z.object({ access_token: z.string() }),
      client: ({ auth }) => auth,
      oauth: {
        authorizationUrl: 'https://example.com',
        tokenUrl: 'https://example.com',
        scopes: [],
      },
    })({ oauth });
    expect(() => sanitize(config({ signIn: [piece] }))).toThrow('account function');
  });

  it.each([
    { name: 'email', type: 'email', unique: false },
    { name: 'email', type: 'text' },
    { name: 'email', type: 'email', localized: true },
    { name: 'email', type: 'email', virtual: true },
  ])('rejects incompatible email override %j', (field) => {
    expect(() => sanitize(config(undefined, [field]))).toThrow('email field');
  });

  it('retains identity and session fields for an OAuth-only collection', async () => {
    const result = sanitize(
      config({
        signIn: [method],
        disableLocalStrategy: { enableFields: true, optionalPassword: true },
      }),
    );
    const users = (await result._internal.payloadConfig).collections.find(
      ({ slug }) => slug === 'users',
    )!;
    expect(users.flattenedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'email', unique: true }),
        expect.objectContaining({ name: 'sessions', type: 'array' }),
      ]),
    );
  });
});

describe('sign-in identity matching', () => {
  const setup = () => {
    const find = vi.fn();
    const create = vi.fn();
    const req = {
      t: () => 'Value must be unique',
      payload: { db: { name: 'postgres' } },
      frogbot: {
        kv: memoryKV().kv,
        db: { find },
        create,
        config: {
          _internal: {
            payloadConfig: Promise.resolve({
              collections: [{ slug: 'users', auth: { verify: true }, trash: true }],
            }),
          },
        },
      },
    } as unknown as FrogbotRequest;
    return {
      req,
      find,
      create,
      resolve: (email: unknown = 'person@example.com') =>
        resolveSignInIdentity({ req, collectionSlug: 'users', email }),
    };
  };

  it('normalizes email and excludes trash using an authoritative collection-scoped query', async () => {
    const { resolve, find, create } = setup();
    find.mockResolvedValue({ docs: [{ id: 1, email: 'person@example.com', _verified: true }] });
    expect(await resolve(' Person@Example.com ')).toBe(1);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        limit: 2,
        where: {
          and: [{ email: { equals: 'person@example.com' } }, { deletedAt: { exists: false } }],
        },
      }),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it.each([undefined, '', ' ', 'bad', 'a@b', 12])(
    'rejects invalid account email %j',
    async (email) => {
      const { req, find } = setup();
      await expect(resolveSignInIdentity({ req, collectionSlug: 'users', email })).rejects.toThrow(
        'account',
      );
      expect(find).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ id: 1, email: 'person@example.com', _verified: false }],
    [{ id: 1, email: 'person@example.com' }],
    [
      { id: 1, email: 'person@example.com', _verified: true },
      { id: 2, email: 'person@example.com', _verified: true },
    ],
  ])('fails closed for ambiguous or locally unverified identity %j', async (...docs) => {
    const { resolve, find, create } = setup();
    find.mockResolvedValue({ docs });
    await expect(resolve()).rejects.toThrow('account');
    expect(create).not.toHaveBeenCalled();
  });

  it('recovers only an email uniqueness conflict by re-reading the winning user', async () => {
    const { resolve, find, create } = setup();
    find
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [{ id: 2, email: 'person@example.com', _verified: true }] });
    create.mockRejectedValue(
      new ValidationError({ errors: [{ path: 'email', message: 'Value must be unique' }] }),
    );
    expect(await resolve()).toBe(2);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        disableVerificationEmail: true,
        data: {
          email: 'person@example.com',
          _verified: true,
          password: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        },
      }),
    );
  });

  it('does not swallow create hook failures', async () => {
    const { resolve, find, create } = setup();
    find.mockResolvedValue({ docs: [] });
    create.mockRejectedValue(new Error('denied'));
    await expect(resolve()).rejects.toThrow('denied');
    expect(find).toHaveBeenCalledTimes(1);
  });
});

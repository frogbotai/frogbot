import { createHash } from 'node:crypto';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { serve } from '@hono/node-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildConfig } from '../../packages/frogbot/src/config/build.js';
import {
  type ConnectionOwner,
  type ConnectionRow,
  ConnectionStore,
} from '../../packages/frogbot/src/connections/store.js';
import type { ConnectionEntry } from '../../packages/frogbot/src/connections/types.js';
import { FrogBot } from '../../packages/frogbot/src/frogbot.js';
import { KVLockContentionError } from '../../packages/frogbot/src/kv/errors.js';
import { definePiece } from '../../packages/frogbot/src/pieces/definePiece.js';
import type { PieceOAuthRecipe } from '../../packages/frogbot/src/pieces/types.js';
import { continuedTo } from '../__helpers/shared/continuedTo.js';
import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';
import { startFakeProvider } from './fakeProvider.js';

const createPiece = definePiece({
  slug: 'example',
  label: 'Example',
  auth: z.object({ apiKey: z.string() }),
  client: () => ({}),
  oauth: {
    authorizationUrl: 'https://example.com/authorize',
    tokenUrl: 'https://example.com/token',
    scopes: { catalog: {}, defaults: [] },
  },
  actions: [],
});

describe(`connection storage [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let frogbot: FrogBot;
  let store: ConnectionStore;
  let owner: ConnectionOwner;
  let other: ConnectionOwner;
  const piece = 'example';
  const credential = { accessToken: 'private-access-token', refreshToken: 'private-refresh-token' };
  let server: ReturnType<typeof serve>;
  let provider: Awaited<ReturnType<typeof startFakeProvider>>;
  let baseURL: string;
  let authorization: string;
  let otherAuthorization: string;
  let customerAuthorization: string;
  let linkedPieces: ReturnType<typeof linkedPiece>[];
  let exchanges: URLSearchParams[] = [];
  const accounts: { auth: unknown; user: unknown }[] = [];

  const linkedAuth = z.object({ apiKey: z.string().min(1) });
  type LinkedAuth = z.output<typeof linkedAuth>;
  const linkedPiece = (providerURL: string, slug: string) =>
    definePiece({
      slug,
      label: slug,
      auth: linkedAuth,
      client: ({ auth }: { auth: unknown }) => ({ auth: linkedAuth.parse(auth) }),
      oauth: {
        authorizationUrl: `${providerURL}/authorize`,
        tokenUrl: `${providerURL}/token`,
        scopes: {
          catalog: { default: 'default', read: 'read', write: 'write' },
          defaults: ['default'],
        },
        pkce: true,
        toAuth: ({ tokens }) => ({
          apiKey: tokens.access_token === 'fresh-bad-auth' ? '' : (tokens.access_token ?? ''),
        }),
        account: ({ client, req }) => {
          accounts.push({ auth: client.auth, user: req.user });

          return Promise.resolve({
            id: client.auth.apiKey === 'fresh-bad-account' ? '' : 'account',
            label: 'Linked account',
            email: 'linked@example.com',
          });
        },
      } satisfies PieceOAuthRecipe<LinkedAuth, { auth: LinkedAuth }>,
      actions: [],
    })({
      slug: `${slug}-instance`,
      oauth: { clientId: 'private-client-id', clientSecret: 'private-client-secret' },
      scopes: ['read', 'write'],
      ...(slug === 'case-ac' || slug === 'case-abc'
        ? { auth: { apiKey: 'developer-fallback' } }
        : {}),
    });

  const request = (path: string, init: RequestInit = {}) =>
    fetch(new URL(path, baseURL), { ...init, redirect: 'manual' });

  const authorize = async (piece = 'case-c', returnTo?: string) => {
    const response = await request(
      `/rest/v1/connections/${piece}/authorize${returnTo === undefined ? '' : `?returnTo=${encodeURIComponent(returnTo)}`}`,
      { headers: { authorization } },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('cache-control')).toBe('no-store');

    const url = new URL(response.headers.get('location')!);
    const callback = new URL(url.searchParams.get('redirect_uri')!);
    callback.searchParams.set('state', url.searchParams.get('state')!);
    callback.searchParams.set('code', 'success');
    const cookie = response.headers.get('set-cookie')!.split(';')[0];

    expect(cookie.startsWith(`linked-oauth-${url.searchParams.get('state')}=`)).toBe(true);

    return { url, callback, cookie };
  };

  const callback = (flow: { callback: URL; cookie: string }, token?: string) =>
    request(flow.callback.href, {
      headers: { cookie: flow.cookie, ...(token ? { authorization: token } : {}) },
    });

  beforeAll(async () => {
    baseURL = await new Promise<string>((resolve) => {
      server = serve(
        { fetch: (req) => frogbot.handleRequest(req.clone()), port: 0, hostname: '127.0.0.1' },
        (address) => resolve(`http://127.0.0.1:${address.port}`),
      );
    });

    provider = await startFakeProvider();
    exchanges = provider.exchanges;
    const providerURL = provider.url;

    linkedPieces = ['case-c', 'case-ac', 'case-bc', 'case-abc'].map((slug) =>
      linkedPiece(providerURL, slug),
    );

    const instance = createPiece({
      slug: 'custom-instance',
      oauth: { clientId: 'client', clientSecret: 'secret' },
    });

    const config = await buildConfig({
      secret: 'connection-storage-test-secret',
      serverURL: baseURL,
      cookiePrefix: 'linked',
      routes: { api: '/rest/v1', admin: '/control' },
      db: await getTestDatabaseAdapter({
        sqlite: sqliteAdapter({ client: { url: 'file::memory:' } }),
      }),
      admin: { user: 'users', importMap: { autoGenerate: false } },
      typescript: { autoGenerate: false },
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'customers', auth: true, fields: [] },
      ],
      connections: [
        { piece: instance, oauth: true, secret: true },
        ...linkedPieces.map((piece): ConnectionEntry<typeof piece> =>
          piece.piece === 'case-bc' || piece.piece === 'case-abc'
            ? { piece, oauth: true, secret: true }
            : { piece, oauth: true },
        ),
      ],
    });

    frogbot = await new FrogBot().init({ config, disableOnInit: true });
    store = new ConnectionStore({ frogbot, config: config.connections, userSlug: 'users' });
    const first = await frogbot.create({
      collection: 'users',
      data: { email: 'first@example.com', password: 'test-password' },
      overrideAccess: true,
    });

    const second = await frogbot.create({
      collection: 'users',
      data: { email: 'second@example.com', password: 'test-password' },
      overrideAccess: true,
    });

    owner = { id: first.id, collection: 'users' };
    other = { id: second.id, collection: 'users' };

    await frogbot.create({
      collection: 'customers',
      data: { email: 'customer@example.com', password: 'test-password' },
      overrideAccess: true,
    });

    const login = async (email: string, collection = 'users') => {
      const response = await request(`/rest/v1/${collection}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'test-password' }),
      });

      expect(response.status).toBe(200);

      return `JWT ${(await response.json()).token}`;
    };

    authorization = await login('first@example.com');
    otherAuthorization = await login('second@example.com');
    customerAuthorization = await login('customer@example.com', 'customers');
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }

    await provider?.close();

    await frogbot?.destroy();
  });

  beforeEach(async () => {
    await frogbot.delete({ collection: 'connections', where: {}, overrideAccess: true });
    exchanges.length = 0;
    accounts.length = 0;
  });

  it('stores only ciphertext and decrypts only through the server helper', async () => {
    const saved = await store.upsert({ owner, piece, method: 'oauth', credential });

    expect(saved).not.toHaveProperty('credential');

    const raw = await frogbot.db.find<ConnectionRow>({
      collection: 'connections',
      pagination: false,
    });

    const ciphertext = raw.docs[0].credential;

    expect(ciphertext).toMatch(/^v1\./);
    expect(ciphertext).not.toContain(credential.accessToken);
    expect(ciphertext).not.toContain(credential.refreshToken);
    expect(JSON.parse(await frogbot.config.connections.encryption.decrypt(ciphertext))).toEqual(
      credential,
    );
    expect(await store.get({ owner, piece })).toMatchObject({ id: saved.id, credential });
    expect(await store.list({ owner })).toEqual([saved]);
    expect(await store.get({ owner: other, piece })).toBeUndefined();
    expect(await store.list({ owner: other })).toEqual([]);
  });

  it('scopes public reads by owner and collection even when hidden fields are requested', async () => {
    const saved = await store.upsert({ owner, piece, method: 'oauth', credential });
    await store.upsert({ owner: other, piece, method: 'secret', credential: 'other-secret' });
    const result = await frogbot.find({
      collection: 'connections',
      user: owner,
      overrideAccess: false,
      showHiddenFields: true,
      depth: 0,
    });

    expect(result.docs).toHaveLength(1);
    expect(result.docs[0].id).toBe(saved.id);
    expect(result.docs[0]).not.toHaveProperty('credential');
    expect(JSON.stringify(result)).not.toContain(credential.accessToken);

    for (const user of [null, { ...owner, collection: 'customers' }]) {
      await expect(
        frogbot.find({ collection: 'connections', user, overrideAccess: false }),
      ).rejects.toThrow();
    }

    await expect(
      frogbot.findByID({
        collection: 'connections',
        id: saved.id,
        user: other,
        overrideAccess: false,
      }),
    ).rejects.toThrow();
  });

  it('denies public create, update, and delete', async () => {
    const saved = await store.upsert({ owner, piece, method: 'oauth', credential });
    const options = { collection: 'connections', user: owner, overrideAccess: false };

    await expect(
      frogbot.create({ ...options, data: { owner: owner.id, piece, credential: 'plaintext' } }),
    ).rejects.toThrow();
    await expect(
      frogbot.update({ ...options, id: saved.id, data: { credential: 'plaintext' } }),
    ).rejects.toThrow();
    await expect(frogbot.delete({ ...options, id: saved.id })).rejects.toThrow();
    expect(await store.get({ owner, piece })).toMatchObject({ credential });
  });

  it('enforces holder/piece/method/account uniqueness at the database layer', async () => {
    const saved = await store.upsert({ owner, piece, method: 'oauth', credential });
    const encrypted = await frogbot.config.connections.encryption.encrypt(JSON.stringify('secret'));
    const data = {
      owner: owner.id,
      holder: `user:${owner.id}`,
      piece,
      method: 'secret',
      credential: encrypted,
      accountId: '',
      isDefault: false,
      status: 'active',
    };

    await expect(
      frogbot.db.create({ collection: 'connections', data: { ...data, method: 'oauth' } }),
    ).rejects.toThrow();
    await expect(frogbot.db.create({ collection: 'connections', data })).resolves.toMatchObject({
      method: 'secret',
      accountId: '',
    });
    await expect(frogbot.db.create({ collection: 'connections', data })).rejects.toThrow();
    await expect(
      frogbot.db.create({ collection: 'connections', data: { ...data, accountId: 'another' } }),
    ).resolves.toMatchObject({ accountId: 'another' });
    await expect(
      frogbot.db.create({
        collection: 'connections',
        data: { ...data, owner: other.id, holder: `user:${other.id}` },
      }),
    ).resolves.toMatchObject({ owner: other.id });
    await expect(
      frogbot.db.create({ collection: 'connections', data: { ...data, piece: 'another-piece' } }),
    ).resolves.toMatchObject({ piece: 'another-piece' });
    expect(await store.get({ owner, piece })).toMatchObject({ id: saved.id, credential });
  });

  it('replaces the same account in its row and clears obsolete OAuth metadata', async () => {
    const saved = await store.upsert({
      owner,
      piece,
      method: 'oauth',
      credential,
      account: { id: 'account-1', label: 'First', email: 'first@example.com' },
      scopes: ['read'],
      expiresAt: '2030-01-01T00:00:00.000Z',
      status: 'error',
    });

    const replacement = await store.upsert({
      owner,
      piece,
      method: 'oauth',
      credential: { accessToken: 'replacement' },
      account: { id: 'account-1', label: 'First again' },
    });

    expect(replacement).toMatchObject({
      id: saved.id,
      piece,
      method: 'oauth',
      accountId: 'account-1',
      isDefault: true,
      account: { id: 'account-1', label: 'First again' },
      scopes: [],
      expiresAt: null,
      status: 'active',
    });
    expect(await store.get({ owner, piece })).toMatchObject({
      credential: { accessToken: 'replacement' },
    });
    expect(await store.list({ owner })).toHaveLength(1);
  });

  it('deletes only the matching owner row and optional row ID', async () => {
    const saved = await store.upsert({ owner, piece, method: 'oauth', credential });

    expect(await store.delete({ owner: other, piece, id: saved.id })).toBe(false);
    expect(await store.delete({ owner, piece, id: 'wrong-id' })).toBe(false);
    expect(await store.delete({ owner, piece, id: saved.id })).toBe(true);
    expect(await store.delete({ owner, piece, id: saved.id })).toBe(false);
    expect(await store.get({ owner, piece })).toBeUndefined();
  });

  it('rejects malformed account metadata without replacing the credential', async () => {
    await store.upsert({ owner, piece, method: 'oauth', credential });

    await expect(
      store.upsert({
        owner,
        piece,
        method: 'oauth',
        credential: 'replacement',
        account: { id: 'account', label: 'Label', accessToken: 'leak' } as never,
      }),
    ).rejects.toThrow('Account');
    expect(await store.get({ owner, piece })).toMatchObject({ credential });
  });

  it('coordinates refresh, replacement, and delete through the same database KV lock', async () => {
    await store.upsert({ owner, piece, method: 'oauth', credential });
    const second = new ConnectionStore({
      frogbot,
      config: frogbot.config.connections,
      userSlug: 'users',
    });

    await store.withLock({
      owner,
      piece,
      fn: async (locked) => {
        expect(await locked.get()).toMatchObject({ credential });
        await expect(
          second.upsert({
            owner: { ...owner, id: String(owner.id) },
            piece,
            method: 'secret',
            credential: 'replacement',
          }),
        ).rejects.toBeInstanceOf(KVLockContentionError);
        await expect(second.delete({ owner, piece })).rejects.toBeInstanceOf(KVLockContentionError);

        await second.upsert({ owner: other, piece, method: 'secret', credential: 'independent' });
        await locked.upsert({ method: 'oauth', credential: { accessToken: 'refreshed' } });
      },
    });

    expect(await store.get({ owner, piece })).toMatchObject({
      credential: { accessToken: 'refreshed' },
    });

    await second.upsert({ owner, piece, method: 'oauth', credential: 'replacement' });

    expect(await store.get({ owner, piece })).toMatchObject({ credential: 'replacement' });
  });

  const notLinked = (resolution: Promise<unknown>) =>
    expect(resolution).rejects.toMatchObject({ code: 'missing' });

  it.each(['case-c', 'case-ac', 'case-bc', 'case-abc'])(
    'links %s through real HTTP, PKCE, fresh account validation and encrypted storage',
    async (piece) => {
      const instance = linkedPieces.find((entry) => entry.piece === piece)!;
      const req = await frogbot.createRequest({ user: owner });
      await notLinked(frogbot.connections.resolve({ piece: instance, req }));
      const flow = await authorize(piece);

      expect(await store.list({ owner })).toEqual([]);
      expect(flow.url.searchParams.get('scope')).toBe('read write');
      expect(flow.url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(flow.url.searchParams.get('redirect_uri')).toBe(
        `${baseURL}/rest/v1/connections/${piece}/callback`,
      );

      const response = await callback(flow);

      expect(await continuedTo(response)).toBe('/control/settings/connections');
      expect(response.headers.get('set-cookie')).toMatch(/^linked-oauth-.*Max-Age=0/);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(accounts).toEqual([{ auth: { apiKey: 'fresh-success' }, user: null }]);
      expect(exchanges).toHaveLength(1);
      expect(exchanges[0].get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(
        createHash('sha256').update(exchanges[0].get('code_verifier')!).digest('base64url'),
      ).toBe(flow.url.searchParams.get('code_challenge'));
      expect(exchanges[0].get('grant_type')).toBe('authorization_code');
      expect(exchanges[0].get('client_id')).toBe('private-client-id');
      expect(exchanges[0].get('client_secret')).toBe('private-client-secret');
      expect(exchanges[0].get('redirect_uri')).toBe(flow.url.searchParams.get('redirect_uri'));

      const row = await store.get({ owner, piece });

      expect(row).toMatchObject({
        method: 'oauth',
        status: 'active',
        credential: { access_token: 'fresh-success' },
        account: { id: 'account', label: 'Linked account', email: 'linked@example.com' },
        scopes: ['read', 'write'],
      });
      expect(Date.parse(row!.expiresAt!) - Date.now()).toBeGreaterThan(3_500_000);
      expect(await frogbot.connections.resolve({ piece: instance, req })).toEqual({
        apiKey: 'fresh-success',
      });

      const raw = await frogbot.db.find<ConnectionRow>({
        collection: 'connections',
        pagination: false,
      });

      expect(raw.docs[0].credential).toMatch(/^v1\./);
      expect(raw.docs[0].credential).not.toContain('fresh-success');

      const publicResponse = await request('/rest/v1/connections', { headers: { authorization } });

      expect(publicResponse.status).toBe(200);

      const body = await publicResponse.text();

      expect(body).not.toContain('fresh-success');
      expect(body).not.toContain('private-refresh-token');

      const byID = await request(`/rest/v1/connections/${row!.id}`, { headers: { authorization } });

      expect(byID.status).toBe(200);
      expect((await byID.json()).id).toBe(row!.id);
    },
  );

  it.each(['case-bc', 'case-abc'])(
    'keeps one key row and one row per OAuth account for %s',
    async (piece) => {
      const saveSecret = (apiKey: string) =>
        request(`/rest/v1/connections/${piece}`, {
          method: 'POST',
          headers: { authorization, 'content-type': 'application/json' },
          body: JSON.stringify({ apiKey }),
        });

      const saved = await saveSecret('static-secret');

      expect(saved.status).toBe(200);

      const secret = await saved.json();

      expect(secret).toMatchObject({ accountId: '', isDefault: true });
      expect((await callback(await authorize(piece))).status).toBe(200);

      const oauth = (await store.list({ owner })).find((row) => row.method === 'oauth')!;

      expect(oauth).toMatchObject({ accountId: 'account', isDefault: false });
      expect(await store.get({ owner, piece, id: oauth.id })).toMatchObject({
        credential: { refresh_token: 'private-refresh-token' },
      });

      const replacement = await authorize(piece);
      replacement.callback.searchParams.set('code', 'replacement');

      expect((await callback(replacement, authorization)).status).toBe(200);
      expect(await store.get({ owner, piece, id: oauth.id })).toMatchObject({
        method: 'oauth',
        expiresAt: null,
        credential: { access_token: 'fresh-replacement' },
      });
      expect((await store.get({ owner, piece, id: oauth.id }))!.credential).not.toHaveProperty(
        'refresh_token',
      );
      expect((await saveSecret('second-secret')).status).toBe(200);
      expect(await store.get({ owner, piece })).toMatchObject({
        id: secret.id,
        method: 'secret',
        isDefault: true,
        credential: { apiKey: 'second-secret' },
      });
      expect(await store.list({ owner })).toHaveLength(2);
    },
  );

  it.each(['no-scope', 'empty-scope'])('stores scope metadata for %s', async (code) => {
    const flow = await authorize(
      'case-c',
      `${baseURL}/control/settings/connections?tab=linked#account`,
    );

    flow.callback.searchParams.set('code', code);
    const response = await callback(flow);

    expect(await continuedTo(response)).toBe('/control/settings/connections?tab=linked#account');
    expect(await store.get({ owner, piece: 'case-c' })).toMatchObject({
      scopes: code === 'no-scope' ? ['read', 'write'] : [],
    });
  });

  it('denies anonymous and non-admin authorization and unknown routes', async () => {
    expect((await request('/rest/v1/connections/case-c/authorize')).status).toBe(401);
    expect(
      (
        await request('/rest/v1/connections/case-c/authorize', {
          headers: { authorization: customerAuthorization },
        })
      ).status,
    ).toBe(403);

    for (const piece of ['unknown', 'case-c-instance', '__proto__']) {
      for (const route of ['authorize', 'callback']) {
        expect(
          (await request(`/rest/v1/connections/${piece}/${route}`, { headers: { authorization } }))
            .status,
        ).toBe(404);
      }
    }

    expect(exchanges).toHaveLength(0);
    expect(await store.list({ owner })).toEqual([]);
  });

  it.each(['owner', 'collection', 'browser'])(
    'denies callback %s mismatch and replay',
    async (kind) => {
      const flow = await authorize();
      const response =
        kind === 'browser'
          ? await callback({ ...flow, cookie: '' })
          : await callback(flow, kind === 'owner' ? otherAuthorization : customerAuthorization);

      expect(response.status).toBe(400);
      expect(exchanges).toHaveLength(0);
      expect(await store.list({ owner })).toEqual([]);
      expect((await callback(flow)).status).toBe(200);
      expect((await callback(flow)).status).toBe(400);
      expect(exchanges).toHaveLength(1);
      expect(await store.list({ owner: other })).toEqual([]);
    },
  );

  it.each([
    {
      code: 'denial',
      exchanged: 0,
      params: { error: 'access_denied-private-detail' },
      emptyParams: { error: 'access_denied' },
    },
    { code: 'provider-error', exchanged: 1, params: {}, emptyParams: {} },
    { code: 'malformed', exchanged: 1, params: {}, emptyParams: {} },
    { code: 'bad-auth', exchanged: 1, params: {}, emptyParams: {} },
    { code: 'bad-account', exchanged: 1, params: {}, emptyParams: {} },
  ])(
    'consumes failed $code callbacks, clears cookies and preserves existing rows',
    async ({ code, exchanged, params, emptyParams }) => {
      const piece = 'case-bc';
      const saved = await store.upsert({
        owner,
        piece,
        method: 'secret',
        credential: { apiKey: 'existing-secret' },
      });

      const flow = await authorize(piece);
      flow.callback.searchParams.set('code', code);

      for (const [name, value] of Object.entries(params)) {
        flow.callback.searchParams.set(name, value);
      }

      const response = await callback(flow);

      expect(response.status).toBe(400);
      expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ error: 'Connection operation failed' });
      expect(await store.get({ owner, piece })).toMatchObject({
        id: saved.id,
        method: 'secret',
        credential: { apiKey: 'existing-secret' },
      });
      expect(exchanges).toHaveLength(exchanged);
      expect((await callback(flow)).status).toBe(400);
      expect(exchanges).toHaveLength(exchanged);

      const emptyFlow = await authorize('case-c');
      emptyFlow.callback.searchParams.set('code', code);

      for (const [name, value] of Object.entries(emptyParams)) {
        emptyFlow.callback.searchParams.set(name, value);
      }

      expect((await callback(emptyFlow)).status).toBe(400);
      expect(await store.get({ owner, piece: 'case-c' })).toBeUndefined();
    },
  );

  it('rejects a deleted owner even when the initiating browser returns without a session', async () => {
    const created = await frogbot.create({
      collection: 'users',
      data: { email: 'deleted@example.com', password: 'test-password' },
      overrideAccess: true,
    });

    const login = await request('/rest/v1/users/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'deleted@example.com', password: 'test-password' }),
    });

    const response = await request('/rest/v1/connections/case-c/authorize', {
      headers: { authorization: `JWT ${(await login.json()).token}` },
    });

    expect(response.status).toBe(302);

    const provider = new URL(response.headers.get('location')!);
    const url = new URL(provider.searchParams.get('redirect_uri')!);
    url.searchParams.set('state', provider.searchParams.get('state')!);
    url.searchParams.set('code', 'success');
    await frogbot.delete({ collection: 'users', id: created.id, overrideAccess: true });
    const flow = { callback: url, cookie: response.headers.get('set-cookie')!.split(';')[0] };
    const failed = await callback(flow);

    expect(failed.status).toBe(400);
    expect(failed.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(failed.headers.get('cache-control')).toBe('no-store');
    expect((await callback(flow)).status).toBe(400);
    expect(exchanges).toHaveLength(0);
    expect(
      (await frogbot.db.find<ConnectionRow>({ collection: 'connections', pagination: false })).docs,
    ).toEqual([]);
  });
});

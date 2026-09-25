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
import { FrogBot } from '../../packages/frogbot/src/frogbot.js';
import { KVLockContentionError } from '../../packages/frogbot/src/kv/errors.js';
import { definePiece } from '../../packages/frogbot/src/pieces/definePiece.js';
import type { PieceInstance } from '../../packages/frogbot/src/pieces/types.js';
import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';

const createPiece = definePiece({
  slug: 'example',
  label: 'Example',
  auth: z.object({ apiKey: z.string() }),
  client: () => ({}),
  oauth: {
    authorizationUrl: 'https://example.com/authorize',
    tokenUrl: 'https://example.com/token',
    scopes: [],
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
  let provider: ReturnType<typeof serve>;
  let baseURL: string;
  let authorization: string;
  let otherAuthorization: string;
  let customerAuthorization: string;
  let linkedPieces: PieceInstance[];
  const exchanges: URLSearchParams[] = [];
  const accounts: { auth: unknown; user: unknown }[] = [];

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
    return { url, callback, cookie: response.headers.get('set-cookie')!.split(';')[0]! };
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
    const providerURL = await new Promise<string>((resolve) => {
      provider = serve(
        {
          port: 0,
          hostname: '127.0.0.1',
          fetch: async (req) => {
            const params = new URLSearchParams(await req.text());
            exchanges.push(params);
            const code = params.get('code');
            if (code === 'provider-error') {
              return Response.json({ error: 'private-provider-error' }, { status: 400 });
            }
            if (code === 'malformed') return Response.json({ access_token: '' });
            return Response.json({
              access_token: `fresh-${code}`,
              ...(code === 'replacement'
                ? {}
                : { refresh_token: 'private-refresh-token', expires_in: 3600 }),
              ...(code === 'no-scope'
                ? {}
                : { scope: code === 'empty-scope' ? '' : 'read write read' }),
            });
          },
        },
        (address) => resolve(`http://127.0.0.1:${address.port}`),
      );
    });
    linkedPieces = ['case-c', 'case-ac', 'case-bc', 'case-abc'].map((slug) =>
      definePiece({
        slug,
        label: slug,
        auth: z.object({ apiKey: z.string().min(1) }),
        client: ({ auth }) => ({ auth }),
        oauth: {
          authorizationUrl: `${providerURL}/authorize`,
          tokenUrl: `${providerURL}/token`,
          scopes: ['default'],
          pkce: true,
          toAuth: ({ tokens }) => ({
            apiKey: tokens.access_token === 'fresh-bad-auth' ? '' : tokens.access_token,
          }),
          account: async ({ client, req }) => {
            accounts.push({ auth: client.auth, user: req.user });
            return {
              id: client.auth.apiKey === 'fresh-bad-account' ? '' : 'account',
              label: 'Linked account',
              email: 'linked@example.com',
            };
          },
        },
        actions: [],
      })({
        slug: `${slug}-instance`,
        oauth: {
          clientId: 'private-client-id',
          clientSecret: 'private-client-secret',
          scopes: ['read', 'write'],
        },
        ...(slug === 'case-ac' || slug === 'case-abc'
          ? { auth: { apiKey: 'developer-fallback' } }
          : {}),
      }),
    );
    const instance = createPiece({
      slug: 'custom-instance',
      oauth: { clientId: 'client', clientSecret: 'secret' },
    });
    const config = await buildConfig({
      secret: 'connection-storage-test-secret',
      serverURL: baseURL,
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
      pieces: [instance, ...linkedPieces],
      connections: [
        { piece: instance, oauth: true, secret: true },
        ...linkedPieces.map((piece) => ({
          piece,
          oauth: true,
          secret: piece.piece === 'case-bc' || piece.piece === 'case-abc',
        })),
      ],
    });
    frogbot = await new FrogBot().init({ config, disableOnInit: true });
    store = new ConnectionStore({ frogbot, config: config.connections, userSlug: 'users' });
    const first = await frogbot.create({
      collection: 'users',
      data: { email: 'first@example.com', password: 'test-password' },
    });
    const second = await frogbot.create({
      collection: 'users',
      data: { email: 'second@example.com', password: 'test-password' },
    });
    owner = { id: first.id, collection: 'users' };
    other = { id: second.id, collection: 'users' };
    await frogbot.create({
      collection: 'customers',
      data: { email: 'customer@example.com', password: 'test-password' },
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
    for (const listener of [server, provider]) {
      if (listener) {
        await new Promise<void>((resolve, reject) =>
          listener.close((error) => (error ? reject(error) : resolve())),
        );
      }
    }
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

  it('enforces owner/piece uniqueness at the database layer', async () => {
    const saved = await store.upsert({ owner, piece, method: 'oauth', credential });
    const encrypted = await frogbot.config.connections.encryption.encrypt(JSON.stringify('secret'));
    const data = {
      owner: owner.id,
      piece,
      method: 'secret',
      credential: encrypted,
      status: 'active',
    };
    await expect(frogbot.db.create({ collection: 'connections', data })).rejects.toThrow();
    await expect(
      frogbot.db.create({ collection: 'connections', data: { ...data, owner: other.id } }),
    ).resolves.toMatchObject({ owner: other.id });
    await expect(
      frogbot.db.create({ collection: 'connections', data: { ...data, piece: 'another-piece' } }),
    ).resolves.toMatchObject({ piece: 'another-piece' });
    expect(await store.get({ owner, piece })).toMatchObject({ id: saved.id, credential });
  });

  it('replaces the same row and clears obsolete OAuth metadata', async () => {
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
      method: 'secret',
      credential: { apiKey: 'replacement-secret' },
    });
    expect(replacement).toMatchObject({
      id: saved.id,
      piece,
      method: 'secret',
      account: null,
      scopes: [],
      expiresAt: null,
      status: 'active',
    });
    expect(await store.get({ owner, piece })).toMatchObject({
      credential: { apiKey: 'replacement-secret' },
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
    await second.upsert({ owner, piece, method: 'secret', credential: 'replacement' });
    expect(await store.get({ owner, piece })).toMatchObject({ credential: 'replacement' });
  });

  it.each(['case-c', 'case-ac', 'case-bc', 'case-abc'])(
    'links %s through real HTTP, PKCE, fresh account validation and encrypted storage',
    async (piece) => {
      const instance = linkedPieces.find((entry) => entry.piece === piece)!;
      const req = await frogbot.createRequest({ user: owner });
      if (piece === 'case-ac' || piece === 'case-abc') {
        expect(await frogbot.connections.resolve({ piece: instance, req })).toEqual({
          apiKey: 'developer-fallback',
        });
      }
      const flow = await authorize(piece);
      expect(await store.list({ owner })).toEqual([]);
      expect(flow.url.searchParams.get('scope')).toBe('read write');
      expect(flow.url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(flow.url.searchParams.get('redirect_uri')).toBe(
        `${baseURL}/rest/v1/connections/${piece}/callback`,
      );
      const response = await callback(flow);
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/control/settings/connections');
      expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(accounts).toEqual([{ auth: { apiKey: 'fresh-success' }, user: null }]);
      expect(exchanges).toHaveLength(1);
      expect(exchanges[0]!.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(
        createHash('sha256').update(exchanges[0]!.get('code_verifier')!).digest('base64url'),
      ).toBe(flow.url.searchParams.get('code_challenge'));
      expect(exchanges[0]!.get('grant_type')).toBe('authorization_code');
      expect(exchanges[0]!.get('client_id')).toBe('private-client-id');
      expect(exchanges[0]!.get('client_secret')).toBe('private-client-secret');
      expect(exchanges[0]!.get('redirect_uri')).toBe(flow.url.searchParams.get('redirect_uri'));
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
      expect(raw.docs[0]!.credential).toMatch(/^v1\./);
      expect(raw.docs[0]!.credential).not.toContain('fresh-success');
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
    'replaces secret → OAuth → OAuth → secret in one row for %s',
    async (piece) => {
      const saveSecret = () =>
        request(`/rest/v1/connections/${piece}`, {
          method: 'POST',
          headers: { authorization, 'content-type': 'application/json' },
          body: JSON.stringify({ apiKey: 'static-secret' }),
        });
      const saved = await saveSecret();
      expect(saved.status).toBe(200);
      const id = (await saved.json()).id;
      expect((await callback(await authorize(piece))).status).toBe(302);
      expect(await store.get({ owner, piece })).toMatchObject({
        id,
        method: 'oauth',
        credential: { refresh_token: 'private-refresh-token' },
      });
      const replacement = await authorize(piece);
      replacement.callback.searchParams.set('code', 'replacement');
      expect((await callback(replacement, authorization)).status).toBe(302);
      expect(await store.get({ owner, piece })).toMatchObject({
        id,
        method: 'oauth',
        expiresAt: null,
        credential: { access_token: 'fresh-replacement' },
      });
      expect((await store.get({ owner, piece }))!.credential).not.toHaveProperty('refresh_token');
      expect((await saveSecret()).status).toBe(200);
      expect(await store.get({ owner, piece })).toMatchObject({
        id,
        method: 'secret',
        scopes: [],
        expiresAt: null,
        account: null,
        credential: { apiKey: 'static-secret' },
      });
      expect(await store.list({ owner })).toHaveLength(1);
    },
  );

  it.each(['no-scope', 'empty-scope'])('stores scope metadata for %s', async (code) => {
    const flow = await authorize(
      'case-c',
      `${baseURL}/control/settings/connections?tab=linked#account`,
    );
    flow.callback.searchParams.set('code', code);
    const response = await callback(flow);
    expect(response.headers.get('location')).toBe(
      '/control/settings/connections?tab=linked#account',
    );
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
      expect((await callback(flow)).status).toBe(302);
      expect((await callback(flow)).status).toBe(400);
      expect(exchanges).toHaveLength(1);
      expect(await store.list({ owner: other })).toEqual([]);
    },
  );

  it.each(['denial', 'provider-error', 'malformed', 'bad-auth', 'bad-account'])(
    'consumes failed %s callbacks, clears cookies and preserves existing rows',
    async (code) => {
      const piece = 'case-bc';
      const saved = await store.upsert({
        owner,
        piece,
        method: 'secret',
        credential: { apiKey: 'existing-secret' },
      });
      const flow = await authorize(piece);
      flow.callback.searchParams.set('code', code);
      if (code === 'denial') {
        flow.callback.searchParams.set('error', 'access_denied-private-detail');
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
      expect(exchanges).toHaveLength(code === 'denial' ? 0 : 1);
      expect((await callback(flow)).status).toBe(400);
      expect(exchanges).toHaveLength(code === 'denial' ? 0 : 1);
      const emptyFlow = await authorize('case-c');
      emptyFlow.callback.searchParams.set('code', code);
      if (code === 'denial') emptyFlow.callback.searchParams.set('error', 'access_denied');
      expect((await callback(emptyFlow)).status).toBe(400);
      expect(await store.get({ owner, piece: 'case-c' })).toBeUndefined();
    },
  );

  it('rejects a deleted owner even when the initiating browser returns without a session', async () => {
    const created = await frogbot.create({
      collection: 'users',
      data: { email: 'deleted@example.com', password: 'test-password' },
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
    const flow = { callback: url, cookie: response.headers.get('set-cookie')!.split(';')[0]! };
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

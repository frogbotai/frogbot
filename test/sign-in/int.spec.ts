import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { serve } from '@hono/node-server';
import { BasePayload, type CollectionBeforeChangeHook } from 'payload';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { buildConfig } from '../../packages/frogbot/src/config/build.js';
import { createOAuthState } from '../../packages/frogbot/src/connections/oauth/index.js';
import { Frogbot } from '../../packages/frogbot/src/frogbot.js';
import * as locks from '../../packages/frogbot/src/kv/lock.js';
import { definePiece } from '../../packages/frogbot/src/pieces/definePiece.js';
import type { SignInMethod } from '../../packages/frogbot/src/pieces/types.js';
import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';

describe(`collection OAuth sign-in [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let frogbot: Frogbot;
  let server: ReturnType<typeof serve>;
  let provider: ReturnType<typeof serve>;
  let baseURL: string;
  let databaseDir: string;
  let method: SignInMethod;
  const exchanges: URLSearchParams[] = [];
  const accounts: { tokens: unknown; client: unknown }[] = [];
  const hooks: string[] = [];
  const sendEmail = vi.fn();
  const beforeChange = vi.fn<CollectionBeforeChangeHook>();

  const request = (path: string | URL, init: RequestInit = {}) =>
    fetch(new URL(path, baseURL), { ...init, redirect: 'manual' });
  const authorize = async ({
    collection = 'users',
    piece = 'work',
    code = 'person@example.com',
    returnTo,
  }: { collection?: string; piece?: string; code?: string; returnTo?: string } = {}) => {
    const response = await request(
      `/rest/v1/${collection}/sign-in/${piece}${returnTo === undefined ? '' : `?returnTo=${encodeURIComponent(returnTo)}`}`,
    );
    expect(response.status).toBe(302);
    const url = new URL(response.headers.get('location')!);
    const callback = new URL(url.searchParams.get('redirect_uri')!);
    callback.searchParams.set('state', url.searchParams.get('state')!);
    callback.searchParams.set('code', code);
    return { url, callback, cookie: response.headers.get('set-cookie')!.split(';')[0]! };
  };
  const callback = (flow: { callback: URL; cookie: string }) =>
    request(flow.callback, { headers: { cookie: flow.cookie } });
  const sessionCookie = (response: Response) =>
    response.headers
      .getSetCookie()
      .find((value) => value.startsWith('identity-token='))
      ?.split(';')[0];
  const rawUser = async (email: string, collection = 'users') =>
    (await frogbot.db.find({ collection, where: { email: { equals: email } }, pagination: false }))
      .docs[0];

  beforeAll(async () => {
    databaseDir = await mkdtemp(join(tmpdir(), 'frogbot-test-sign-in-'));
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
            return Response.json({
              access_token: `fresh:${params.get('code')}`,
              refresh_token: 'never-persist-refresh',
              expires_in: 3600,
            });
          },
        },
        (address) => resolve(`http://127.0.0.1:${address.port}`),
      );
    });
    const createIdentity = definePiece({
      slug: 'identity',
      label: 'Identity',
      auth: z.object({ access_token: z.string() }),
      client: ({ auth }) => auth,
      oauth: {
        authorizationUrl: `${providerURL}/authorize`,
        tokenUrl: `${providerURL}/token`,
        scopes: ['openid', 'email'],
        pkce: true,
        toAuth: ({ tokens }) => ({ access_token: tokens.access_token }),
        account: async ({ tokens, client }) => {
          accounts.push({ tokens, client });
          const email = tokens.access_token.slice('fresh:'.length);
          return {
            id: 'provider-account',
            label: 'Provider account',
            email: email === 'missing' ? (undefined as unknown as string) : email,
          };
        },
      },
      actions: [],
    });
    method = createIdentity({
      slug: 'work',
      oauth: { clientId: 'client', clientSecret: 'private-app-secret' },
      auth: { access_token: 'wrong-developer-fallback' },
    });
    const otherMethod = createIdentity({
      slug: 'other',
      oauth: { clientId: 'other-client', clientSecret: 'other-secret' },
    });
    const createTestEmail = definePiece({
      slug: 'test-email',
      label: 'Test email',
      options: z.object({
        from: z.object({ address: z.string(), name: z.string().optional() }),
      }),
      actions: [],
      email: {
        send: ({ message }) => sendEmail(message),
      },
    });
    const config = await buildConfig({
      secret: 'sign-in-test-secret',
      serverURL: baseURL,
      cookiePrefix: 'identity',
      routes: { api: '/rest/v1', admin: '/control' },
      db: await getTestDatabaseAdapter({
        sqlite: sqliteAdapter({
          client: { url: `file:${join(databaseDir, 'sign-in.db')}` },
        }),
      }),
      admin: { user: 'users', importMap: { autoGenerate: false } },
      typescript: { autoGenerate: false },
      email: createTestEmail({
        from: {
          address: 'test@example.com',
          name: 'Test',
        },
      }),
      collections: [
        ...['users', 'customers'].map((slug) => ({
          slug,
          trash: true,
          auth: {
            signIn: [method, otherMethod],
            verify: true,
            cookies: { sameSite: 'lax' as const },
          },
          fields: [],
          hooks: {
            beforeChange: [beforeChange],
            beforeLogin: [
              ({ user, req }: { user: Record<string, unknown>; req: unknown }) => {
                expect(req).toHaveProperty('frogbot', frogbot);
                hooks.push(`${slug}:before`);
                if (user.email === 'hook-denied@example.com') throw new Error('private-hook-error');
              },
            ],
            afterLogin: [
              () => {
                hooks.push(`${slug}:after`);
              },
            ],
          },
        })),
        { slug: 'password-users', auth: true, fields: [] },
      ],
      connections: [{ piece: method, oauth: true }],
    });
    frogbot = await new Frogbot().init({ config, disableOnInit: true });
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
    if (databaseDir) await rm(databaseDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    exchanges.length = 0;
    accounts.length = 0;
    hooks.length = 0;
    sendEmail.mockClear();
    beforeChange.mockReset();
  });

  it('rejects explicitly disabled SQLite transactions during sign-in initialization', async () => {
    const args = Object.freeze({
      client: { url: `file:${join(databaseDir, 'disabled.db')}` },
      transactionOptions: false as const,
    });
    const adapter = sqliteAdapter(args);
    const init = adapter.init;
    const config = await buildConfig({
      secret: 'disabled-transactions-test-secret',
      db: adapter,
      admin: { user: 'users', importMap: { autoGenerate: false } },
      typescript: { autoGenerate: false },
      collections: [{ slug: 'users', auth: { signIn: [method] }, fields: [] }],
    });
    await expect(
      new BasePayload().init({ config: config._internal.payloadConfig, disableOnInit: true }),
    ).rejects.toThrow(
      'SQLite signIn requires transactions. Remove transactionOptions: false or set transactionOptions: {} in sqliteAdapter().',
    );
    expect(args.transactionOptions).toBe(false);
    expect(adapter.init).toBe(init);
  });

  it.skipIf(process.env.FROGBOT_DATABASE && process.env.FROGBOT_DATABASE !== 'sqlite')(
    'refuses SQL KV lock release during a SQLite transaction without blocking later writes',
    async () => {
      const lock = await frogbot.kv.acquireLock('release-during-transaction', 30_000);
      expect(lock).not.toBeNull();
      const transaction = await frogbot.db.beginTransaction();
      expect(transaction).toBeTruthy();
      try {
        expect(await frogbot.kv.releaseLock(lock!)).toBe(false);
      } finally {
        await frogbot.db.rollbackTransaction(transaction!);
      }
      expect(await frogbot.kv.releaseLock(lock!)).toBe(true);
    },
  );

  it.skipIf(process.env.FROGBOT_DATABASE && process.env.FROGBOT_DATABASE !== 'sqlite')(
    'fails closed without hanging when a default SQLite session transaction outlives its SQL KV lease',
    async () => {
      const email = 'expired-sql-lease@example.com';
      await frogbot.create({
        collection: 'users',
        data: { email, password: 'local-test-password', _verified: true },
      });
      const run = locks.runKVLock;
      const lease = vi
        .spyOn(locks, 'runKVLock')
        .mockImplementation((args) => run({ ...args, ttl: 300 }));
      const update = frogbot.db.updateOne.bind(frogbot.db);
      let delayed = false;
      const write = vi.spyOn(frogbot.db, 'updateOne').mockImplementation(async (args) => {
        const result = await update(args);
        if (!delayed && args.collection === 'users' && Array.isArray(args.data.sessions)) {
          delayed = true;
          await setTimeout(750);
        }
        return result;
      });
      try {
        const response = await request('/rest/v1/users/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password: 'local-test-password' }),
        });
        expect(delayed).toBe(true);
        expect(response.status).toBe(500);
        expect(sessionCookie(response)).toBeUndefined();
        expect((await rawUser(email)).sessions ?? []).toEqual([]);
        expect(Object.keys(frogbot.db.sessions ?? {})).toHaveLength(0);
      } finally {
        write.mockRestore();
        lease.mockRestore();
      }
      const response = await callback(await authorize({ code: email }));
      expect(response.status).toBe(302);
      expect((await rawUser(email)).sessions).toHaveLength(1);
    },
    10_000,
  );

  it('authorizes anonymously, creates a verified user, runs login hooks and sets a usable collection session', async () => {
    const flow = await authorize({
      code: ' Person@Example.com ',
      returnTo: '/control/settings?tab=profile',
    });
    expect(flow.callback.pathname).toBe('/rest/v1/users/sign-in/work/callback');
    expect(flow.url.searchParams.get('scope')).toBe('openid email');
    const response = await callback(flow);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/control/settings?tab=profile');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.getSetCookie()).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Max-Age=0'),
        expect.stringContaining('HttpOnly'),
      ]),
    );
    const user = await rawUser('person@example.com');
    expect(user).toMatchObject({ email: 'person@example.com', _verified: true });
    expect(user.hash).toBeTruthy();
    expect(user.sessions).toHaveLength(1);
    expect(hooks).toEqual(['users:before', 'users:after']);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(accounts[0]).toMatchObject({ client: { access_token: 'fresh: Person@Example.com ' } });
    expect(flow.url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(exchanges[0].get('code_verifier')!).digest('base64url'),
    );
    const me = await request('/rest/v1/users/me', {
      headers: { cookie: sessionCookie(response)!, origin: baseURL },
    });
    expect(me.status).toBe(200);
    expect((await me.json()).user).toMatchObject({ id: user.id, collection: 'users' });
    expect((await frogbot.count({ collection: 'connections' })).totalDocs).toBe(0);
    expect(JSON.stringify(user)).not.toContain('fresh:');
    expect(JSON.stringify(user)).not.toContain('never-persist-refresh');
  });

  it('matches an existing user without changing their password or verification status', async () => {
    const before = await rawUser('person@example.com');
    const response = await callback(await authorize());
    expect(response.status).toBe(302);
    const after = await rawUser('person@example.com');
    expect(after.id).toBe(before.id);
    expect(after.hash).toBe(before.hash);
    expect(after.salt).toBe(before.salt);
    expect(after._verified).toBe(true);
    expect(after.sessions).toHaveLength(2);
    expect(hooks).toEqual(['users:before', 'users:after']);
  });

  it('reuses the same instance across collections without crossing identity or redirect scope', async () => {
    const response = await callback(await authorize({ collection: 'customers' }));
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/');
    expect(hooks).toEqual(['customers:before', 'customers:after']);
    const me = await request('/rest/v1/customers/me', {
      headers: { cookie: sessionCookie(response)!, origin: baseURL },
    });
    expect((await me.json()).user).toMatchObject({
      email: 'person@example.com',
      collection: 'customers',
    });
    expect((await rawUser('person@example.com')).sessions).toHaveLength(2);
    expect((await rawUser('person@example.com', 'customers')).sessions).toHaveLength(1);
  });

  it.each([
    '/rest/v1/users/sign-in/unknown',
    '/rest/v1/users/sign-in/unknown/callback',
    '/rest/v1/password-users/sign-in/work',
    '/rest/v1/unknown/sign-in/work',
    '/rest/v1/users/sign-in/identity',
  ])('rejects unknown or wrong route %s', async (path) => {
    expect((await request(path)).status).toBe(404);
    expect(exchanges).toHaveLength(0);
  });

  it.each(['collection', 'method', 'browser', 'state', 'flow'])(
    'rejects a wrong %s binding before exchange',
    async (kind) => {
      const flow = await authorize({ code: 'wrong-binding@example.com' });
      if (kind === 'collection') {
        flow.callback.pathname = flow.callback.pathname.replace('/users/', '/customers/');
      }
      if (kind === 'method') {
        flow.callback.pathname = flow.callback.pathname.replace('/work/', '/other/');
      }
      if (kind === 'browser') flow.cookie = '';
      if (kind === 'state') flow.callback.searchParams.set('state', 'invalid');
      if (kind === 'flow') {
        const state = await createOAuthState({
          kv: frogbot.kv,
          encryption: frogbot.config.connections.encryption,
          piece: method,
          flow: 'link',
          collection: 'users',
          callbackUrl: `${baseURL}/rest/v1/users/sign-in/work/callback`,
          returnTo: '/control',
          req: { user: { id: 1, collection: 'users' } },
        });
        flow.callback.searchParams.set('state', state.state);
        flow.cookie = state.setCookie.split(';')[0];
      }
      const response = await callback(flow);
      expect(response.status).toBe(400);
      expect(sessionCookie(response)).toBeUndefined();
      expect(exchanges).toHaveLength(0);
      expect(hooks).toHaveLength(0);
    },
  );

  it('consumes state on provider cancellation and refuses replay', async () => {
    const flow = await authorize();
    flow.callback.searchParams.set('error', 'access_denied');
    expect((await callback(flow)).status).toBe(400);
    flow.callback.searchParams.delete('error');
    expect((await callback(flow)).status).toBe(400);
    expect(exchanges).toHaveLength(0);
  });

  it('rejects replay after a successful callback', async () => {
    const flow = await authorize({ code: 'replay@example.com' });
    expect((await callback(flow)).status).toBe(302);
    expect((await callback(flow)).status).toBe(400);
    expect(exchanges).toHaveLength(1);
  });

  it.each(['missing', '', ' ', 'not-email'])(
    'rejects invalid account email %j without creating a user or session',
    async (code) => {
      const count = await frogbot.count({ collection: 'users' });
      const response = await callback(await authorize({ code }));
      expect(response.status).toBe(400);
      expect(sessionCookie(response)).toBeUndefined();
      expect(await frogbot.count({ collection: 'users' })).toEqual(count);
      expect(hooks).toHaveLength(0);
    },
  );

  it('does not promote an existing locally unverified account', async () => {
    const user = await frogbot.create({
      collection: 'users',
      data: { email: 'unverified@example.com', password: 'password' },
      disableVerificationEmail: true,
    });
    const response = await callback(await authorize({ code: 'unverified@example.com' }));
    expect(response.status).toBe(400);
    expect(sessionCookie(response)).toBeUndefined();
    const stored = await rawUser('unverified@example.com');
    expect(stored).toMatchObject({
      id: user.id,
      _verified: false,
    });
    expect(stored.sessions ?? []).toEqual([]);
    expect(hooks).toHaveLength(0);
  });

  it('excludes trashed identities and fails closed if their email still occupies the unique index', async () => {
    const user = await frogbot.create({
      collection: 'users',
      data: { email: 'trashed@example.com', password: 'password', _verified: true },
      disableVerificationEmail: true,
    });
    await frogbot.update({
      collection: 'users',
      id: user.id,
      data: { deletedAt: new Date().toISOString() },
    });
    const response = await callback(await authorize({ code: 'trashed@example.com' }));
    expect(response.status).toBe(400);
    expect(sessionCookie(response)).toBeUndefined();
    expect(hooks).toHaveLength(0);
  });

  it('propagates login-hook rejection without a cookie and removes the failed session', async () => {
    const response = await callback(await authorize({ code: 'hook-denied@example.com' }));
    expect(response.status).toBe(500);
    expect(sessionCookie(response)).toBeUndefined();
    expect(await response.text()).not.toContain('private-hook-error');
    expect((await rawUser('hook-denied@example.com')).sessions).toEqual([]);
  });

  it('keeps concurrent callbacks on one unique identity', async () => {
    const email = 'concurrent@example.com';
    const flows = await Promise.all([
      authorize({ code: ' Concurrent@Example.com ' }),
      authorize({ code: email, piece: 'other' }),
    ]);
    const release = Promise.withResolvers<void>();
    let blocked = false;
    let contending = false;
    let overlappingReads = 0;
    const create = frogbot.create.bind(frogbot);
    const createSpy = vi.spyOn(frogbot, 'create').mockImplementation(async (args) => {
      if (args.collection === 'users' && args.data.email === email) {
        blocked = true;
        await release.promise;
        blocked = false;
      }
      return create(args);
    });
    const find = frogbot.db.find.bind(frogbot.db);
    const get = frogbot.kv.get.bind(frogbot.kv);
    const findSpy = vi.spyOn(frogbot.db, 'find').mockImplementation((args) => {
      if (blocked && args.collection === 'users') {
        overlappingReads++;
        contending = true;
      }
      return find(args);
    });
    const getSpy = vi.spyOn(frogbot.kv, 'get').mockImplementation((key) => {
      if (blocked && key === `auth:session:${JSON.stringify(['users'])}`) contending = true;
      return get(key);
    });
    const pending = [callback(flows[0])];
    let responses: Response[];
    try {
      await vi.waitFor(() => expect(blocked).toBe(true), { timeout: 5000 });
      pending.push(callback(flows[1]));
      await vi.waitFor(() => expect(contending).toBe(true), { timeout: 5000 });
      expect(overlappingReads).toBe(0);
    } finally {
      release.resolve();
      try {
        responses = await Promise.all(pending);
      } finally {
        createSpy.mockRestore();
        findSpy.mockRestore();
        getSpy.mockRestore();
      }
    }
    expect(responses.map(({ status }) => status)).toEqual([302, 302]);
    expect(
      beforeChange.mock.calls.filter(
        ([{ data, operation }]) => operation === 'create' && data.email === email,
      ),
    ).toHaveLength(1);
    expect(
      (
        await frogbot.count({
          collection: 'users',
          where: { email: { equals: email } },
        })
      ).totalDocs,
    ).toBe(1);
    const user = await rawUser(email);
    expect(user.sessions).toHaveLength(2);
    for (const response of responses) {
      const me = await request('/rest/v1/users/me', {
        headers: { cookie: sessionCookie(response)!, origin: baseURL },
      });
      expect(me.status).toBe(200);
      expect((await me.json()).user).toMatchObject({ id: user.id, collection: 'users' });
    }
    expect((await frogbot.count({ collection: 'connections' })).totalDocs).toBe(0);
    expect(JSON.stringify(user)).not.toContain('fresh:');
    expect(JSON.stringify(user)).not.toContain('never-persist-refresh');
  });

  it('rejects external redirects and leaves connection authorization session-protected', async () => {
    expect(
      (await request('/rest/v1/users/sign-in/work?returnTo=https://evil.example')).status,
    ).toBe(400);
    expect((await request('/rest/v1/connections/identity/authorize')).status).toBe(401);
    expect((await frogbot.count({ collection: 'connections' })).totalDocs).toBe(0);
  });

  it('preserves password login', async () => {
    await frogbot.create({
      collection: 'users',
      data: { email: 'password@example.com', password: 'test-password', _verified: true },
      disableVerificationEmail: true,
    });
    const response = await request('/rest/v1/users/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'password@example.com', password: 'test-password' }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).token).toBeTruthy();
  });
});

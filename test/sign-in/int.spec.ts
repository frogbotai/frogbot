import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { serve } from '@hono/node-server';
import { BasePayload, type TypeWithID } from 'payload';
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { z } from 'zod';

import type { CollectionBeforeChangeHook } from '../../packages/frogbot/src/collections/config/types.js';
import { buildConfig } from '../../packages/frogbot/src/config/build.js';
import { createOAuthState } from '../../packages/frogbot/src/connections/oauth/index.js';
import { FrogBot } from '../../packages/frogbot/src/frogbot.js';
import { createSQLKV } from '../../packages/frogbot/src/kv/adapters/sql.js';
import * as locks from '../../packages/frogbot/src/kv/lock.js';
import { definePiece } from '../../packages/frogbot/src/pieces/definePiece.js';
import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';

type StoredUser = TypeWithID & {
  email: string;
  hash?: string;
  salt?: string;
  _verified?: boolean;
  sessions?: { id: string }[];
};

describe(`collection OAuth sign-in [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let frogbot: FrogBot;
  let server: ReturnType<typeof serve>;
  let provider: ReturnType<typeof serve>;
  let baseURL: string;
  let databaseDir: string;
  let method: ReturnType<typeof signInMethods>['method'];
  const exchanges: URLSearchParams[] = [];
  const accounts: { tokens: unknown; client: unknown }[] = [];
  const hooks: string[] = [];
  const sendEmail = vi.fn();
  const beforeChange = vi.fn<CollectionBeforeChangeHook>();
  const domainAccessCalls: { email?: string; user: unknown }[] = [];
  const domainAccess = ({ data, req }: { data?: { email?: string }; req: { user?: unknown } }) => {
    domainAccessCalls.push({ email: data?.email, user: req.user });

    return data?.email?.endsWith('@trend.com') === true;
  };

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

    return { url, callback, cookie: response.headers.get('set-cookie')!.split(';')[0] };
  };

  const callback = (flow: { callback: URL; cookie: string }) =>
    request(flow.callback, { headers: { cookie: flow.cookie } });

  const sessionCookie = (response: Response) =>
    response.headers
      .getSetCookie()
      .find((value) => value.startsWith('identity-token='))
      ?.split(';')[0];

  const continuedTo = async (response: Response) => {
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');

    const url = /<meta http-equiv="refresh" content="0;url=([^"]*)">/.exec(
      await response.text(),
    )?.[1];

    return url?.replaceAll('&#38;', '&');
  };

  const rawUser = async (email: string, collection = 'users') =>
    (
      await frogbot.db.find<StoredUser>({
        collection,
        where: { email: { equals: email } },
        pagination: false,
      })
    ).docs[0];

  const signInMethods = (providerURL: string) => {
    const createIdentity = definePiece({
      slug: 'identity',
      label: 'Identity',
      auth: z.object({ access_token: z.string() }),
      client: ({ auth }: { auth: unknown }) => auth,
      oauth: {
        authorizationUrl: `${providerURL}/authorize`,
        tokenUrl: `${providerURL}/token`,
        scopes: { catalog: { openid: 'openid', email: 'email' }, defaults: ['openid', 'email'] },
        pkce: true,
        toAuth: ({ tokens }) => ({ access_token: tokens.access_token }),
        account: ({ tokens, client }) => {
          accounts.push({ tokens, client });
          const email = (tokens.access_token ?? '').slice('fresh:'.length);

          return Promise.resolve({
            id: 'provider-account',
            label: 'Provider account',
            email: email === 'missing' ? (undefined as unknown as string) : email,
          });
        },
      },
      actions: [],
    });

    return {
      method: createIdentity({
        slug: 'work',
        oauth: { clientId: 'client', clientSecret: 'private-app-secret' },
        auth: { access_token: 'wrong-developer-fallback' },
      }),
      otherMethod: createIdentity({
        slug: 'other',
        oauth: { clientId: 'other-client', clientSecret: 'other-secret' },
      }),
    };
  };

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

    const methods = signInMethods(providerURL);
    method = methods.method;
    const otherMethod = methods.otherMethod;
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
          access: {
            create: () => true,
            read: ({ req }: { req: { user?: unknown } }) => Boolean(req.user),
          },
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
        { slug: 'members', auth: { signIn: [method] }, fields: [] },
        {
          slug: 'domain-members',
          access: { create: domainAccess },
          auth: { signIn: [method] },
          fields: [],
        },
        {
          slug: 'oauth-only',
          access: { read: ({ req }: { req: { user?: unknown } }) => Boolean(req.user) },
          auth: {
            signIn: [method],
            disableLocalStrategy: { enableFields: true as const },
            cookies: { sameSite: 'lax' as const },
          },
          fields: [],
        },
      ],
      connections: [{ piece: method, oauth: true }],
    });

    frogbot = await new FrogBot().init({ config, disableOnInit: true });
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
    'waits to release a SQL KV lock until a SQLite transaction ends without blocking later writes',
    async () => {
      const lock = await frogbot.kv.acquireLock('release-during-transaction', 30_000);

      expect(lock).not.toBeNull();

      const transaction = await frogbot.db.beginTransaction();

      expect(transaction).toBeTruthy();

      onTestFinished(() => frogbot.db.rollbackTransaction(transaction!));
      let settled = false;
      const release = frogbot.kv.releaseLock(lock!).finally(() => {
        settled = true;
      });

      await frogbot.kv.get('release-during-transaction');

      expect(settled).toBe(false);

      await frogbot.db.rollbackTransaction(transaction!);

      expect(await release).toBe(true);

      const next = await frogbot.kv.acquireLock('release-during-transaction', 30_000);

      expect(next).not.toBeNull();
      expect(await frogbot.kv.releaseLock(next!)).toBe(true);
    },
  );

  it.skipIf(process.env.FROGBOT_DATABASE && process.env.FROGBOT_DATABASE !== 'sqlite')(
    'refuses SQL KV lock release during a transaction on plain Payload SQLite, which has no write lock',
    async () => {
      const lock = await frogbot.kv.acquireLock('payload-release-during-transaction', 30_000);

      expect(lock).not.toBeNull();

      const payloadSQLite = { ...frogbot.db, packageName: '@payloadcms/db-sqlite' };
      const kv = createSQLKV({ adapter: payloadSQLite, collectionSlug: 'payload-kv' });
      const transaction = await frogbot.db.beginTransaction();

      expect(transaction).toBeTruthy();

      onTestFinished(() => frogbot.db.rollbackTransaction(transaction!));

      expect(await kv.releaseLock(lock!)).toBe(false);

      await frogbot.db.rollbackTransaction(transaction!);

      expect(await kv.releaseLock(lock!)).toBe(true);
    },
  );

  it.skipIf(process.env.FROGBOT_DATABASE && process.env.FROGBOT_DATABASE !== 'sqlite')(
    'fails closed without hanging when a default SQLite session transaction outlives its SQL KV lease',
    async () => {
      const email = 'expired-sql-lease@example.com';

      await frogbot.create({
        collection: 'users',
        data: { email, password: 'local-test-password', _verified: true },
        overrideAccess: true,
      });

      const run = locks.runKVLock;
      const signals: AbortSignal[] = [];
      const lease = vi.spyOn(locks, 'runKVLock').mockImplementation((args) =>
        run({
          ...args,
          ttl: 300,
          fn: (lock) => {
            signals.push(lock.signal);

            return args.fn(lock);
          },
        }),
      );

      const update = frogbot.db.updateOne.bind(frogbot.db);
      let delayed = false;
      const write = vi.spyOn(frogbot.db, 'updateOne').mockImplementation(async (args) => {
        const result = await update(args);
        if (!delayed && args.collection === 'users' && Array.isArray(args.data.sessions)) {
          delayed = true;

          await vi.waitFor(() => expect(signals.some(({ aborted }) => aborted)).toBe(true), {
            timeout: 5000,
          });
        }

        return result;
      });

      onTestFinished(() => {
        write.mockRestore();
        lease.mockRestore();
      });

      const failed = await request('/rest/v1/users/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'local-test-password' }),
      });

      expect(delayed).toBe(true);
      expect(failed.status).toBe(500);
      expect(sessionCookie(failed)).toBeUndefined();
      expect((await rawUser(email)).sessions ?? []).toEqual([]);
      expect(Object.keys(frogbot.db.sessions ?? {})).toHaveLength(0);

      write.mockRestore();
      lease.mockRestore();
      const response = await callback(await authorize({ code: email }));

      expect(response.status).toBe(200);
      expect((await rawUser(email)).sessions).toHaveLength(1);
    },
    10_000,
  );

  it('authorizes anonymously, creates a verified user, runs login hooks and sets a usable collection session', async () => {
    const flow = await authorize({
      code: ' Person@Example.com ',
      returnTo: '/control/settings?tab=profile&view=list',
    });

    expect(flow.callback.pathname).toBe('/rest/v1/users/sign-in/work/callback');
    expect(flow.url.searchParams.get('scope')).toBe('openid email');

    const response = await callback(flow);

    expect(await continuedTo(response)).toBe('/control/settings?tab=profile&view=list');
    expect(response.headers.get('cache-control')).toBe('no-store');

    const state = flow.url.searchParams.get('state')!;
    const cookies = response.headers.getSetCookie();

    expect(flow.cookie.startsWith(`identity-oauth-${state}=`)).toBe(true);
    expect(cookies.filter((value) => value.startsWith(`identity-oauth-${state}=;`))).toEqual([
      expect.stringContaining('Max-Age=0'),
    ]);
    expect(cookies).toEqual(
      expect.arrayContaining([expect.stringMatching(/^identity-token=.*HttpOnly/)]),
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
    expect(
      (await frogbot.count({ collection: 'connections', overrideAccess: true })).totalDocs,
    ).toBe(0);
    expect(JSON.stringify(user)).not.toContain('fresh:');
    expect(JSON.stringify(user)).not.toContain('never-persist-refresh');
  });

  it('matches an existing user without changing their password or verification status', async () => {
    const before = await rawUser('person@example.com');
    const response = await callback(await authorize());

    expect(response.status).toBe(200);

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

    expect(await continuedTo(response)).toBe('/');
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

  it('returns through a same-origin page, so the load it navigates to sees the session', async () => {
    const response = await callback(await authorize({ returnTo: '/rest/v1/users/me' }));
    const next = await continuedTo(response);
    const cookie = sessionCookie(response)!;
    const load = async (site: string) =>
      (await (await request(next!, { headers: { cookie, 'sec-fetch-site': site } })).json()).user;

    expect(next).toBe('/rest/v1/users/me');
    expect(await load('cross-site')).toBeNull();
    expect(await load('same-origin')).toMatchObject({ email: 'person@example.com' });
  });

  it('sets a usable session on a collection with the local strategy off, and keeps password operations off', async () => {
    const response = await callback(
      await authorize({ collection: 'oauth-only', code: 'oauth-only@example.com' }),
    );

    expect(response.status).toBe(200);

    expect((await rawUser('oauth-only@example.com', 'oauth-only')).hash).toBeFalsy();

    const cookie = sessionCookie(response)!;
    const me = async () =>
      (
        await (
          await request('/rest/v1/oauth-only/me', { headers: { cookie, origin: baseURL } })
        ).json()
      ).user;

    expect(await me()).toMatchObject({
      email: 'oauth-only@example.com',
      collection: 'oauth-only',
      _strategy: 'oauth-only-sign-in',
    });

    for (const [path, body] of [
      ['login', { email: 'oauth-only@example.com', password: 'guess' }],
      ['forgot-password', { email: 'oauth-only@example.com' }],
      ['first-register', { email: 'first@example.com', password: 'first-password' }],
    ] as const) {
      const refused = await request(`/rest/v1/oauth-only/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(refused.status, path).toBe(403);
      expect(sessionCookie(refused), path).toBeUndefined();
    }

    expect(
      (
        await request('/rest/v1/oauth-only/logout', {
          method: 'POST',
          headers: { cookie, origin: baseURL },
        })
      ).status,
    ).toBe(200);
    expect((await rawUser('oauth-only@example.com', 'oauth-only')).sessions).toEqual([]);
    expect(await me()).toBeNull();
  });

  it.each([
    '/rest/v1/users/sign-in/unknown/callback',
    '/rest/v1/password-users/sign-in/work',
    '/rest/v1/unknown/sign-in/work',
    '/rest/v1/users/sign-in/identity',
  ])('rejects unknown or wrong route %s', async (path) => {
    expect((await request(path)).status).toBe(404);
    expect(exchanges).toHaveLength(0);
  });

  type Flow = Awaited<ReturnType<typeof authorize>>;

  it.each<{ kind: string; tamper: (flow: Flow) => void | Promise<void> }>([
    {
      kind: 'collection',
      tamper: (flow) => {
        flow.callback.pathname = flow.callback.pathname.replace('/users/', '/customers/');
      },
    },
    {
      kind: 'method',
      tamper: (flow) => {
        flow.callback.pathname = flow.callback.pathname.replace('/work/', '/other/');
      },
    },
    {
      kind: 'browser',
      tamper: (flow) => {
        flow.cookie = '';
      },
    },
    {
      kind: 'state',
      tamper: (flow) => {
        flow.callback.searchParams.set('state', 'invalid');
      },
    },
    {
      kind: 'flow',
      tamper: async (flow) => {
        const state = await createOAuthState({
          kv: frogbot.kv,
          encryption: frogbot.config.connections.encryption,
          piece: method,
          flow: 'link',
          collection: 'users',
          callbackUrl: `${baseURL}/rest/v1/users/sign-in/work/callback`,
          cookiePrefix: 'identity',
          returnTo: '/control',
          req: { user: { id: 1, collection: 'users' } },
        });

        flow.callback.searchParams.set('state', state.state);
        flow.cookie = state.setCookie.split(';')[0];
      },
    },
  ])('rejects a wrong $kind binding before exchange', async ({ tamper }) => {
    const flow = await authorize({ code: 'wrong-binding@example.com' });
    await tamper(flow);
    const response = await callback(flow);

    expect(response.status).toBe(400);
    expect(sessionCookie(response)).toBeUndefined();
    expect(exchanges).toHaveLength(0);
    expect(hooks).toHaveLength(0);
  });

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

    expect((await callback(flow)).status).toBe(200);
    expect((await callback(flow)).status).toBe(400);
    expect(exchanges).toHaveLength(1);
  });

  it.each(['missing', '', ' ', 'not-email'])(
    'rejects invalid account email %j without creating a user or session',
    async (code) => {
      const count = await frogbot.count({ collection: 'users', overrideAccess: true });
      const response = await callback(await authorize({ code }));

      expect(response.status).toBe(400);
      expect(sessionCookie(response)).toBeUndefined();
      expect(await frogbot.count({ collection: 'users', overrideAccess: true })).toEqual(count);
      expect(hooks).toHaveLength(0);
    },
  );

  it('does not promote an existing locally unverified account', async () => {
    const user = await frogbot.create({
      collection: 'users',
      data: { email: 'unverified@example.com', password: 'password' },
      disableVerificationEmail: true,
      overrideAccess: true,
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
      overrideAccess: true,
    });

    await frogbot.update({
      collection: 'users',
      id: user.id,
      data: { deletedAt: new Date().toISOString() },
      overrideAccess: true,
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

    let releaseCreate!: () => void;
    const released = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });

    let blocked = false;
    let contending = false;
    let overlappingReads = 0;
    const create = frogbot.create.bind(frogbot);
    const createSpy = vi.spyOn(frogbot, 'create').mockImplementation(async (args) => {
      if (args.collection === 'users' && args.data.email === email) {
        blocked = true;
        await released;
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

    onTestFinished(async () => {
      releaseCreate();
      await Promise.allSettled(pending);
      createSpy.mockRestore();
      findSpy.mockRestore();
      getSpy.mockRestore();
    });

    await vi.waitFor(() => expect(blocked).toBe(true), { timeout: 5000 });
    pending.push(callback(flows[1]));
    await vi.waitFor(() => expect(contending).toBe(true), { timeout: 5000 });

    expect(overlappingReads).toBe(0);

    releaseCreate();
    const responses = await Promise.all(pending);
    createSpy.mockRestore();
    findSpy.mockRestore();
    getSpy.mockRestore();

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
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
          overrideAccess: true,
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

    expect(
      (await frogbot.count({ collection: 'connections', overrideAccess: true })).totalDocs,
    ).toBe(0);
    expect(JSON.stringify(user)).not.toContain('fresh:');
    expect(JSON.stringify(user)).not.toContain('never-persist-refresh');
  });

  describe('who can sign up', () => {
    const refusal = "This app doesn't let new people sign up. Ask an admin to add you.";

    const reset = async (collection: string, emails: string[] = []) => {
      await frogbot.db.deleteMany({ collection, where: {} });

      for (const email of emails) {
        await frogbot.create({
          collection,
          data: { email, password: 'local-test-password' },
          overrideAccess: true,
        });
      }
    };

    const count = async (collection: string, email?: string) =>
      (
        await frogbot.count({
          collection,
          overrideAccess: true,
          ...(email ? { where: { email: { equals: email } } } : {}),
        })
      ).totalDocs;

    const expectRefused = async (response: Response, collection: string, email: string) => {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: refusal });
      expect(sessionCookie(response)).toBeUndefined();
      expect(await count(collection, email)).toBe(0);
    };

    it('refuses a stranger under default create access and creates nothing', async () => {
      await reset('members', ['admin@example.com']);

      const response = await callback(
        await authorize({ collection: 'members', code: 'stranger@example.com' }),
      );

      await expectRefused(response, 'members', 'stranger@example.com');

      expect(await count('members')).toBe(1);
    });

    it('still signs in an existing user under default create access', async () => {
      await reset('members', ['admin@example.com', 'member@example.com']);

      const response = await callback(
        await authorize({ collection: 'members', code: 'member@example.com' }),
      );

      expect(response.status).toBe(200);
      expect(sessionCookie(response)).toBeTruthy();
      expect(await count('members')).toBe(2);
    });

    it('lets a stranger in when create access is open', async () => {
      expect(await count('users')).toBeGreaterThan(0);

      const response = await callback(await authorize({ code: 'open-stranger@example.com' }));

      expect(response.status).toBe(200);
      expect(await rawUser('open-stranger@example.com')).toMatchObject({ _verified: true });
    });

    it('applies a create rule that reads the email, with no signed-in user', async () => {
      await reset('domain-members', ['admin@trend.com']);
      domainAccessCalls.length = 0;

      const allowed = await callback(
        await authorize({ collection: 'domain-members', code: 'New@Trend.com' }),
      );

      expect(allowed.status).toBe(200);
      expect(await count('domain-members', 'new@trend.com')).toBe(1);
      expect(domainAccessCalls).toEqual([{ email: 'new@trend.com', user: null }]);

      const refused = await callback(
        await authorize({ collection: 'domain-members', code: 'outsider@example.com' }),
      );

      await expectRefused(refused, 'domain-members', 'outsider@example.com');
    });

    it('lets the first user into an empty collection under default create access', async () => {
      await reset('members');

      const response = await callback(
        await authorize({ collection: 'members', code: 'first@example.com' }),
      );

      expect(response.status).toBe(200);
      expect(sessionCookie(response)).toBeTruthy();
      expect(await count('members')).toBe(1);
    });

    it('lets only one of two concurrent first sign-ins through the first-user exception', async () => {
      await reset('members');

      const flows = await Promise.all([
        authorize({ collection: 'members', code: 'first-a@example.com' }),
        authorize({ collection: 'members', code: 'first-b@example.com' }),
      ]);

      let releaseCreate!: () => void;
      const released = new Promise<void>((resolve) => {
        releaseCreate = resolve;
      });

      let blocked = false;
      let contending = false;
      const create = frogbot.create.bind(frogbot);
      const createSpy = vi.spyOn(frogbot, 'create').mockImplementation(async (args) => {
        if (args.collection === 'members' && !blocked) {
          blocked = true;
          await released;
        }

        return create(args);
      });

      const get = frogbot.kv.get.bind(frogbot.kv);
      const getSpy = vi.spyOn(frogbot.kv, 'get').mockImplementation((key) => {
        if (blocked && key === `auth:session:${JSON.stringify(['members'])}`) contending = true;

        return get(key);
      });

      const pending = [callback(flows[0])];

      onTestFinished(async () => {
        releaseCreate();
        await Promise.allSettled(pending);
        createSpy.mockRestore();
        getSpy.mockRestore();
      });

      await vi.waitFor(() => expect(blocked).toBe(true), { timeout: 5000 });
      pending.push(callback(flows[1]));
      await vi.waitFor(() => expect(contending).toBe(true), { timeout: 5000 });
      releaseCreate();
      const responses = await Promise.all(pending);

      expect(responses.map(({ status }) => status)).toEqual([200, 403]);
      expect(await count('members')).toBe(1);
      expect(await count('members', 'first-a@example.com')).toBe(1);
    });
  });

  it('rejects external redirects and leaves connection authorization session-protected', async () => {
    expect(
      (await request('/rest/v1/users/sign-in/work?returnTo=https://evil.example')).status,
    ).toBe(400);
    expect((await request('/rest/v1/connections/identity/authorize')).status).toBe(401);
    expect(
      (await frogbot.count({ collection: 'connections', overrideAccess: true })).totalDocs,
    ).toBe(0);
  });

  it('preserves password login', async () => {
    await frogbot.create({
      collection: 'users',
      data: { email: 'password@example.com', password: 'test-password', _verified: true },
      disableVerificationEmail: true,
      overrideAccess: true,
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

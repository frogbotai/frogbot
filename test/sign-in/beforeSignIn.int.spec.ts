import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { serve } from '@hono/node-server';
import type { TypeWithID } from 'payload';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { finishSignIn } from '../../packages/frogbot/src/auth/signIn/finish.js';
import type { CollectionBeforeSignInHook } from '../../packages/frogbot/src/collections/config/types.js';
import { buildConfig } from '../../packages/frogbot/src/config/build.js';
import { FrogBot } from '../../packages/frogbot/src/frogbot.js';
import { definePiece } from '../../packages/frogbot/src/pieces/definePiece.js';
import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';

type StoredUser = TypeWithID & { email: string; sessions?: { id: string }[] };

type Paused = { userId: string | number; method: string; returnTo: string };

const baseURL = 'http://app.test';

describe(`beforeSignIn and finishSignIn [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let frogbot: FrogBot;
  let provider: ReturnType<typeof serve>;
  let databaseDir: string;
  let paused: Paused | undefined;
  let hookCalls: Parameters<CollectionBeforeSignInHook>[0][] = [];
  let loginContexts: unknown[] = [];

  const request = (path: string | URL, init: RequestInit = {}) =>
    frogbot.handleRequest(new Request(new URL(path, baseURL), { ...init, redirect: 'manual' }));

  const signIn = async ({
    collection = 'users',
    email,
    returnTo,
  }: {
    collection?: string;
    email: string;
    returnTo: string;
  }) => {
    const started = await request(
      `/rest/v1/${collection}/sign-in/work?returnTo=${encodeURIComponent(returnTo)}`,
    );

    expect(started.status).toBe(302);

    const authorize = new URL(started.headers.get('location')!);
    const callback = new URL(authorize.searchParams.get('redirect_uri')!);
    callback.searchParams.set('state', authorize.searchParams.get('state')!);
    callback.searchParams.set('code', email);

    return request(callback, {
      headers: { cookie: started.headers.get('set-cookie')!.split(';')[0] },
    });
  };

  const resume = (collection: string, mode: 'page' | 'json', returnTo?: string) =>
    request(`/rest/v1/${collection}/resume`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode, returnTo }),
    });

  const cookies = (response: Response) => response.headers.getSetCookie();

  const sessionCookie = (response: Response) =>
    cookies(response).find((value) => value.startsWith('identity-token='));

  const sessions = async (email: string, collection = 'users') =>
    (
      await frogbot.db.find<StoredUser>({
        collection,
        where: { email: { equals: email } },
        pagination: false,
      })
    ).docs[0]?.sessions ?? [];

  const pause: CollectionBeforeSignInHook = (args) => {
    hookCalls.push(args);
    paused = { userId: args.user.id, method: args.method, returnTo: args.returnTo };

    return Response.redirect(new URL('/two-step', baseURL), 303);
  };

  beforeAll(async () => {
    databaseDir = await mkdtemp(join(tmpdir(), 'frogbot-test-before-sign-in-'));

    const providerURL = await new Promise<string>((resolve) => {
      provider = serve(
        {
          port: 0,
          hostname: '127.0.0.1',
          fetch: async (req) =>
            Response.json({
              access_token: `fresh:${new URLSearchParams(await req.text()).get('code')}`,
              expires_in: 3600,
            }),
        },
        (address) => resolve(`http://127.0.0.1:${address.port}`),
      );
    });

    const method = definePiece({
      slug: 'identity',
      label: 'Identity',
      auth: z.object({ access_token: z.string() }),
      client: ({ auth }: { auth: unknown }) => auth,
      oauth: {
        authorizationUrl: `${providerURL}/authorize`,
        tokenUrl: `${providerURL}/token`,
        scopes: { catalog: { email: 'email' }, defaults: ['email'] },
        pkce: true,
        toAuth: ({ tokens }) => ({ access_token: tokens.access_token }),
        account: ({ tokens }) =>
          Promise.resolve({
            id: 'account',
            label: 'Account',
            email: (tokens.access_token ?? '').slice('fresh:'.length),
          }),
      },
      actions: [],
    })({ slug: 'work', oauth: { clientId: 'client', clientSecret: 'secret' } });

    const resumeEndpoint = (collectionSlug: string) => ({
      path: '/resume',
      method: 'post' as const,
      handler: async (req: Parameters<typeof finishSignIn>[0]['req']) => {
        const body = (await req.json!()) as { mode: 'page' | 'json'; returnTo?: string };
        const { userId, method: slug, returnTo } = paused!;
        const headers = new Headers({ 'set-cookie': 'pending=; Path=/; Max-Age=0' });

        return body.mode === 'json'
          ? finishSignIn({ req, collectionSlug, userId, method: slug, response: 'json', headers })
          : finishSignIn({
              req,
              collectionSlug,
              userId,
              method: slug,
              returnTo: body.returnTo ?? returnTo,
              headers,
            });
      },
    });

    const config = await buildConfig({
      secret: 'before-sign-in-test-secret',
      serverURL: baseURL,
      cookiePrefix: 'identity',
      routes: { api: '/rest/v1', admin: '/control' },
      db: await getTestDatabaseAdapter({
        sqlite: sqliteAdapter({ client: { url: `file:${join(databaseDir, 'sign-in.db')}` } }),
      }),
      admin: { user: 'users', importMap: { autoGenerate: false } },
      typescript: { autoGenerate: false },
      collections: ['users', 'members'].map((slug) => ({
        slug,
        access: { create: () => true },
        auth: {
          signIn: [method],
          ...(slug === 'members' ? { removeTokenFromResponses: true as const } : {}),
        },
        endpoints: [resumeEndpoint(slug)],
        fields: [{ name: 'secret', type: 'text' as const, hidden: true }],
        hooks: {
          beforeSignIn: [() => undefined, pause, () => expect.unreachable()],
          beforeLogin: [
            ({ req }: { req: { context: { signIn?: unknown } } }) => {
              loginContexts.push(req.context.signIn);
            },
          ],
        },
      })),
      connections: [{ piece: method, oauth: true }],
    });

    frogbot = await new FrogBot().init({ config, disableOnInit: true });
  });

  afterAll(async () => {
    if (provider) {
      await new Promise<void>((resolve, reject) =>
        provider.close((error) => (error ? reject(error) : resolve())),
      );
    }

    await frogbot?.destroy();
    if (databaseDir) await rm(databaseDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    paused = undefined;
    hookCalls = [];
    loginContexts = [];
  });

  it('pauses on the first Response with no session or auth cookie, then finishSignIn continues to returnTo', async () => {
    const response = await signIn({ email: 'paused@example.com', returnTo: '/control/account' });

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${baseURL}/two-step`);
    expect(sessionCookie(response)).toBeUndefined();
    expect(cookies(response)).toEqual([expect.stringMatching(/^identity-oauth-.+Max-Age=0/)]);
    expect(await sessions('paused@example.com')).toEqual([]);
    expect(loginContexts).toEqual([]);
    expect(hookCalls).toEqual([
      expect.objectContaining({
        method: 'work',
        returnTo: '/control/account',
        user: expect.objectContaining({ email: 'paused@example.com', secret: null }),
        collection: expect.objectContaining({ slug: 'users' }),
      }),
    ]);

    const finished = await resume('users', 'page');

    expect(finished.status).toBe(200);
    expect(finished.headers.get('cache-control')).toBe('no-store');
    expect(await finished.text()).toContain(
      '<meta http-equiv="refresh" content="0;url=/control/account">',
    );
    expect(sessionCookie(finished)).toMatch(/^identity-token=[^;]+;/);
    expect(cookies(finished)).toContain('pending=; Path=/; Max-Age=0');
    expect(await sessions('paused@example.com')).toHaveLength(1);
    expect(loginContexts).toEqual([{ method: 'work' }]);
  });

  it('answers like Payload login in json mode', async () => {
    await signIn({ email: 'json@example.com', returnTo: '/control' });

    await frogbot.db.updateOne({
      collection: 'users',
      id: paused!.userId,
      data: { secret: 'never-sent' },
    });

    const finished = await resume('users', 'json');
    const body = (await finished.json()) as Record<string, unknown>;

    expect(finished.status).toBe(200);
    expect(body).toEqual({
      message: expect.any(String),
      token: expect.any(String),
      exp: expect.any(Number),
      user: expect.objectContaining({ id: paused!.userId, email: 'json@example.com' }),
    });
    expect(body.user).not.toHaveProperty('secret');
    expect(body.user).not.toHaveProperty('sessions');
    expect(sessionCookie(finished)).toContain(body.token as string);
    expect(cookies(finished)).toContain('pending=; Path=/; Max-Age=0');
    expect(await sessions('json@example.com')).toHaveLength(1);

    const me = await request('/rest/v1/users/me', {
      headers: { authorization: `JWT ${body.token as string}` },
    });

    expect(((await me.json()) as { user?: { email?: string } }).user?.email).toBe(
      'json@example.com',
    );
  });

  it('drops the token from the json body under removeTokenFromResponses and keeps the cookie', async () => {
    await signIn({ collection: 'members', email: 'member@example.com', returnTo: '/' });

    const finished = await resume('members', 'json');
    const body = (await finished.json()) as Record<string, unknown>;

    expect(finished.status).toBe(200);
    expect(body).not.toHaveProperty('token');
    expect(body.exp).toEqual(expect.any(Number));
    expect(sessionCookie(finished)).toMatch(/^identity-token=[^;]+;/);
    expect(await sessions('member@example.com', 'members')).toHaveLength(1);
  });

  it('refuses a returnTo on another origin before writing a session', async () => {
    await signIn({ email: 'elsewhere@example.com', returnTo: '/control' });

    const finished = await resume('users', 'page', 'https://evil.test/');

    expect(finished.status).toBeGreaterThanOrEqual(400);
    expect(sessionCookie(finished)).toBeUndefined();
    expect(await sessions('elsewhere@example.com')).toEqual([]);
    expect(loginContexts).toEqual([]);
  });
});

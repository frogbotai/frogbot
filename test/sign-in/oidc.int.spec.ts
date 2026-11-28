import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { createOidc } from '@frogbotai/piece-oidc';
import { createOkta } from '@frogbotai/piece-okta';
import { serve } from '@hono/node-server';
import { buildConfig, type FrogBotInstance } from 'frogbot';
import { FrogBot } from 'frogbot/test';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';

const CLIENT_ID = 'frogbot-app';
const CLIENT_SECRET = 'oidc-secret';

type Person = { sub: string; email: string; name?: string; email_verified?: boolean | string };

describe(`Sign in with OpenID Connect [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let frogbot: FrogBotInstance;
  let app: ReturnType<typeof serve>;
  let stub: ReturnType<typeof serve>;
  let baseURL: string;
  let idpURL: string;
  let databaseDir: string;
  let openSignUps = false;
  const codes = new Map<string, { person: Person; challenge: string; redirectUri: string }>();
  const tokens = new Map<string, Person>();
  const refusals: string[] = [];
  const discoveries: string[] = [];

  const request = (path: string | URL, init: RequestInit = {}) =>
    fetch(new URL(path, baseURL), { ...init, redirect: 'manual' });

  const start = (method: string) => request(`/api/users/sign-in/${method}`);

  const signIn = async (method: string, issuer: string, person: Person) => {
    const started = await start(method);

    expect(started.status).toBe(302);

    const authorize = new URL(started.headers.get('location')!);

    expect(authorize.origin + authorize.pathname).toBe(`${issuer}/v1/authorize`);
    expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: `${baseURL}/api/users/sign-in/${method}/callback`,
      scope: 'openid email profile',
      code_challenge_method: 'S256',
    });

    const code = `code-${codes.size}-${Math.random()}`;

    codes.set(code, {
      person,
      challenge: authorize.searchParams.get('code_challenge')!,
      redirectUri: authorize.searchParams.get('redirect_uri')!,
    });

    const callback = new URL(authorize.searchParams.get('redirect_uri')!);
    callback.searchParams.set('code', code);
    callback.searchParams.set('state', authorize.searchParams.get('state')!);

    return request(callback, {
      headers: { cookie: started.headers.get('set-cookie')!.split(';')[0] },
    });
  };

  const session = (response: Response) =>
    response.headers
      .getSetCookie()
      .find((value) => value.startsWith('frogbot-token='))
      ?.split(';')[0];

  const users = async (email: string) =>
    (
      await frogbot.find({
        collection: 'users',
        where: { email: { equals: email } },
        overrideAccess: true,
      })
    ).docs;

  async function idp(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);
    const discovery = pathname.match(/^(.*)\/\.well-known\/openid-configuration$/);

    if (req.method === 'GET' && discovery) {
      const issuer = `${idpURL}${discovery[1]}`;
      discoveries.push(discovery[1]);

      return Response.json({
        issuer: discovery[1] === '/wrong' ? idpURL : issuer,
        authorization_endpoint: `${issuer}/v1/authorize`,
        token_endpoint: `${issuer}/v1/token`,
        userinfo_endpoint: `${issuer}/v1/userinfo`,
      });
    }

    if (req.method === 'POST' && pathname.endsWith('/v1/token')) {
      const basic = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`;
      if (req.headers.get('authorization') !== basic) {
        refusals.push('client');

        return Response.json({ error: 'invalid_client' }, { status: 401 });
      }

      const body = new URLSearchParams(await req.text());
      const entry = codes.get(body.get('code') ?? '');
      const verifier = body.get('code_verifier') ?? '';
      if (
        body.get('grant_type') !== 'authorization_code' ||
        !entry ||
        entry.redirectUri !== body.get('redirect_uri') ||
        createHash('sha256').update(verifier).digest('base64url') !== entry.challenge
      ) {
        refusals.push('grant');

        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      }

      codes.delete(body.get('code')!);
      const token = `token-${tokens.size}`;
      tokens.set(token, entry.person);

      return Response.json({ access_token: token, token_type: 'Bearer', expires_in: 600 });
    }

    if (req.method === 'GET' && pathname.endsWith('/v1/userinfo')) {
      const person = tokens.get(req.headers.get('authorization')?.slice('Bearer '.length) ?? '');
      if (!person) return Response.json({ error: 'invalid_token' }, { status: 401 });

      return Response.json(person);
    }

    return new Response(null, { status: 404 });
  }

  const listen = (fetch: (req: Request) => Response | Promise<Response>) =>
    new Promise<{ server: ReturnType<typeof serve>; url: string }>((resolve) => {
      const server = serve({ fetch, port: 0, hostname: '127.0.0.1' }, (address) =>
        resolve({ server, url: `http://127.0.0.1:${address.port}` }),
      );
    });

  beforeAll(async () => {
    databaseDir = await mkdtemp(join(tmpdir(), 'frogbot-test-oidc-sign-in-'));
    ({ server: stub, url: idpURL } = await listen(idp));
    ({ server: app, url: baseURL } = await listen((req) => frogbot.handleRequest(req)));

    const oauth = { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET };
    const config = await buildConfig({
      secret: 'oidc-sign-in-test-secret',
      serverURL: baseURL,
      db: await getTestDatabaseAdapter({
        sqlite: sqliteAdapter({ client: { url: `file:${join(databaseDir, 'oidc.db')}` } }),
      }),
      admin: { importMap: { autoGenerate: false } },
      typescript: { autoGenerate: false },
      collections: [
        {
          slug: 'users',
          access: { create: () => openSignUps },
          auth: {
            signIn: [
              createOidc({ issuer: `${idpURL}/sso`, oauth }),
              createOkta({ issuer: `${idpURL}/oauth2/default`, oauth }),
              createOidc({ issuer: `${idpURL}/wrong`, oauth, slug: 'wrong' }),
            ],
          },
          fields: [{ name: 'name', type: 'text' }],
        },
      ],
    });

    frogbot = await new FrogBot().init({ config, disableOnInit: true });
  });

  afterAll(async () => {
    for (const server of [app, stub]) {
      if (server) {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    }

    await frogbot?.destroy();
    if (databaseDir) await rm(databaseDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    openSignUps = false;
    refusals.length = 0;
  });

  it('signs a new person up through the discovered endpoints, with a working session', async () => {
    openSignUps = true;

    const response = await signIn('oidc', `${idpURL}/sso`, {
      sub: 'a1',
      email: 'ada@example.com',
      name: 'Ada',
      email_verified: true,
    });

    expect(response.status).toBe(200);
    expect(refusals).toEqual([]);

    const me = await request('/api/users/me', {
      headers: { cookie: session(response)!, origin: baseURL },
    });

    expect((await me.json()).user).toMatchObject({ email: 'ada@example.com' });
  });

  it('reads the discovery document once and reuses it', async () => {
    const before = discoveries.filter((path) => path === '/sso').length;

    await signIn('oidc', `${idpURL}/sso`, {
      sub: 'a1',
      email: 'ada@example.com',
      email_verified: 'true',
    });

    expect(discoveries.filter((path) => path === '/sso').length).toBe(before);
  });

  it("refuses an email the provider hasn't verified", async () => {
    openSignUps = true;

    for (const email_verified of [false, undefined, 'false']) {
      const response = await signIn('oidc', `${idpURL}/sso`, {
        sub: 'e1',
        email: 'eve@example.com',
        email_verified,
      });

      expect(response.status).not.toBe(200);
      expect(session(response)).toBeUndefined();
    }

    expect(await users('eve@example.com')).toEqual([]);
  });

  it('signs an existing user in through Okta, which sends no email_verified', async () => {
    const [ada] = await users('ada@example.com');
    const response = await signIn('okta', `${idpURL}/oauth2/default`, {
      sub: '00u1',
      email: 'Ada@Example.com',
    });

    expect(response.status).toBe(200);

    const me = await request('/api/users/me', {
      headers: { cookie: session(response)!, origin: baseURL },
    });

    expect((await me.json()).user).toMatchObject({ id: ada.id });
  });

  it("keeps Okta sign-ups behind the collection's access.create", async () => {
    const response = await signIn('okta', `${idpURL}/oauth2/default`, {
      sub: '00u2',
      email: 'bob@example.com',
    });

    expect(response.status).toBe(403);
    expect(await users('bob@example.com')).toEqual([]);
  });

  it('refuses to start when the discovery document names another issuer', async () => {
    const response = await start('wrong');

    expect(response.status).toBe(500);
    expect(response.headers.get('location')).toBeNull();
  });
});

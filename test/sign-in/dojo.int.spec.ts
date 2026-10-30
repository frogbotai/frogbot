import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { serve } from '@hono/node-server';
import { buildConfig, type FrogBotInstance } from 'frogbot';
import { FrogBot } from 'frogbot/test';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { dojo } from '../../packages/plugins/plugin-dojo/src/index.js';
import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';

const CLIENT_ID = '42';
const CLIENT_SECRET = 'dojo-oauth-secret';

type Person = { sub: string; email: string; name?: string; email_verified?: boolean };

describe(`Sign in with Dojo [${process.env.FROGBOT_DATABASE || 'sqlite'}]`, () => {
  let frogbot: FrogBotInstance;
  let app: ReturnType<typeof serve>;
  let stub: ReturnType<typeof serve>;
  let baseURL: string;
  let dojoURL: string;
  let databaseDir: string;
  let openSignUps = false;
  const codes = new Map<string, { person: Person; challenge: string; redirectUri: string }>();
  const tokens = new Map<string, Person>();
  const refusals: string[] = [];

  const request = (path: string | URL, init: RequestInit = {}) =>
    fetch(new URL(path, baseURL), { ...init, redirect: 'manual' });

  const signIn = async (person: Person) => {
    const started = await request('/api/users/sign-in/dojo');

    expect(started.status).toBe(302);

    const authorize = new URL(started.headers.get('location')!);

    expect(authorize.origin + authorize.pathname).toBe(`${dojoURL}/api/oauth/authorize`);
    expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: `${baseURL}/api/users/sign-in/dojo/callback`,
      scope: 'profile email',
      code_challenge_method: 'S256',
    });

    const code = `code-${codes.size}`;

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

  async function dojoEndpoint(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);

    if (req.method === 'POST' && pathname === '/api/oauth/token') {
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
      const token = `${CLIENT_ID}.token-${tokens.size}`;
      tokens.set(token, entry.person);

      return Response.json({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 600,
        scope: 'profile email',
      });
    }

    if (req.method === 'GET' && pathname === '/api/oauth/userinfo') {
      const person = tokens.get(req.headers.get('authorization')?.slice('Bearer '.length) ?? '');
      if (!person) return Response.json({ error: 'invalid_token' }, { status: 401 });

      return Response.json({ email_verified: true, ...person });
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
    databaseDir = await mkdtemp(join(tmpdir(), 'frogbot-test-dojo-sign-in-'));
    ({ server: stub, url: dojoURL } = await listen(dojoEndpoint));
    ({ server: app, url: baseURL } = await listen((req) => frogbot.handleRequest(req)));

    vi.stubEnv('DOJO', '1');
    vi.stubEnv('DOJO_R2_ENDPOINT', 'http://127.0.0.1:9/r2');
    vi.stubEnv('DOJO_R2_BUCKET', 'dojo-sign-in');
    vi.stubEnv('DOJO_R2_ACCESS_KEY_ID', 'r2-key');
    vi.stubEnv('DOJO_R2_SECRET_ACCESS_KEY', 'r2-secret');
    vi.stubEnv('DOJO_AI_API_KEY', 'dojo-ai-key');
    vi.stubEnv('DOJO_AI_BASE_URL', 'http://127.0.0.1:9/v1');
    vi.stubEnv('DOJO_JOBS_SECRET', 'dojo-jobs-secret');
    vi.stubEnv('DOJO_OAUTH_CLIENT_ID', CLIENT_ID);
    vi.stubEnv('DOJO_OAUTH_CLIENT_SECRET', CLIENT_SECRET);
    vi.stubEnv('DOJO_URL', dojoURL);

    const config = await buildConfig({
      secret: 'dojo-sign-in-test-secret',
      serverURL: baseURL,
      db: await getTestDatabaseAdapter({
        sqlite: sqliteAdapter({ client: { url: `file:${join(databaseDir, 'dojo.db')}` } }),
      }),
      admin: { importMap: { autoGenerate: false } },
      typescript: { autoGenerate: false },
      collections: [
        {
          slug: 'users',
          access: { create: () => openSignUps },
          auth: true,
          fields: [{ name: 'name', type: 'text' }],
        },
      ],
      plugins: [dojo()],
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
    vi.unstubAllEnvs();
    if (databaseDir) await rm(databaseDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    openSignUps = false;
    refusals.length = 0;
  });

  it("gives an empty app's first Dojo visitor an account, with a working session", async () => {
    const response = await signIn({ sub: '1', email: 'ada@example.com', name: 'Ada' });

    expect(response.status).toBe(200);
    expect(refusals).toEqual([]);
    expect(await users('ada@example.com')).toHaveLength(1);

    const me = await request('/api/users/me', {
      headers: { cookie: session(response)!, origin: baseURL },
    });

    expect((await me.json()).user).toMatchObject({ email: 'ada@example.com' });
  });

  it('signs an existing user in as themselves', async () => {
    const [before] = await users('ada@example.com');
    const response = await signIn({ sub: '1', email: 'ada@example.com', name: 'Ada' });

    expect(response.status).toBe(200);
    expect(session(response)).toBeDefined();
    expect((await users('ada@example.com')).map(({ id }) => id)).toEqual([before.id]);
  });

  it("refuses a new email when the app's access.create does", async () => {
    const response = await signIn({ sub: '2', email: 'bob@example.com' });

    expect(response.status).toBe(403);
    expect(session(response)).toBeUndefined();
    expect(await users('bob@example.com')).toEqual([]);
  });

  it('accepts a new email when access.create allows it', async () => {
    openSignUps = true;

    const response = await signIn({ sub: '2', email: 'bob@example.com' });

    expect(response.status).toBe(200);
    expect(session(response)).toBeDefined();
    expect(await users('bob@example.com')).toHaveLength(1);
  });

  it('signs a password user in by email, whatever case Dojo sends it in', async () => {
    const own = await frogbot.create({
      collection: 'users',
      data: { email: 'cy@example.com', password: 'cy-password-123' },
      overrideAccess: true,
    });

    const response = await signIn({ sub: '3', email: 'Cy@Example.COM' });

    expect(response.status).toBe(200);

    const me = await request('/api/users/me', {
      headers: { cookie: session(response)!, origin: baseURL },
    });

    expect((await me.json()).user).toMatchObject({ id: own.id, email: 'cy@example.com' });
    expect(await users('cy@example.com')).toHaveLength(1);
  });

  it('refuses an email Dojo has not verified, even with open sign-ups', async () => {
    openSignUps = true;

    const response = await signIn({ sub: '4', email: 'eve@example.com', email_verified: false });

    expect(response.status).not.toBe(200);
    expect(session(response)).toBeUndefined();
    expect(await users('eve@example.com')).toEqual([]);
  });

  it('refuses to sign in as an existing user when Dojo has not verified the email', async () => {
    const response = await signIn({ sub: '5', email: 'ada@example.com', email_verified: false });

    expect(response.status).not.toBe(200);
    expect(session(response)).toBeUndefined();
  });
});

import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { serve } from '@hono/node-server';
import { buildConfig, type CollectionConfig, type FrogBotInstance } from 'frogbot';
import { FrogBot } from 'frogbot/test';
import { expect, vi } from 'vitest';

import { dojo } from '../../packages/plugins/plugin-dojo/src/index.js';
import { getTestDatabaseAdapter } from '../__helpers/shared/db/getTestDatabaseAdapter.js';

const CLIENT_ID = '42';
const CLIENT_SECRET = 'dojo-oauth-secret';

export type Person = { sub: string; email: string; name?: string; email_verified?: boolean };

type Server = ReturnType<typeof serve>;

const listen = (fetch: (req: Request) => Response | Promise<Response>) =>
  new Promise<{ server: Server; url: string }>((resolve) => {
    const server = serve({ fetch, port: 0, hostname: '127.0.0.1' }, (address) =>
      resolve({ server, url: `http://127.0.0.1:${address.port}` }),
    );
  });

/**
 * A FrogBot app on Dojo with `dojo()` and a `users` collection (`collection` overrides it), beside a stub of Dojo's OAuth server.
 * `env` adds or overrides Dojo's variables; `onInit: true` runs the app's `onInit`s at start.
 */
export async function startDojoApp({
  name,
  collection = {},
  env = {},
  onInit = false,
}: {
  name: string;
  collection?: Partial<CollectionConfig>;
  env?: Record<string, string>;
  onInit?: boolean;
}) {
  let frogbot: FrogBotInstance | undefined;
  const codes = new Map<string, { person: Person; challenge: string; redirectUri: string }>();
  const tokens = new Map<string, Person>();
  const refusals: string[] = [];
  const databaseDir = await mkdtemp(join(tmpdir(), `frogbot-test-${name}-`));

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

  const { server: stub, url: dojoURL } = await listen(dojoEndpoint);
  const { server: app, url: baseURL } = await listen((req) => frogbot!.handleRequest(req));

  const variables: Record<string, string> = {
    DOJO: '1',
    DOJO_R2_ENDPOINT: 'http://127.0.0.1:9/r2',
    DOJO_R2_BUCKET: name,
    DOJO_R2_ACCESS_KEY_ID: 'r2-key',
    DOJO_R2_SECRET_ACCESS_KEY: 'r2-secret',
    DOJO_AI_API_KEY: 'dojo-ai-key',
    DOJO_AI_BASE_URL: 'http://127.0.0.1:9/v1',
    DOJO_JOBS_SECRET: 'dojo-jobs-secret',
    DOJO_OAUTH_CLIENT_ID: CLIENT_ID,
    DOJO_OAUTH_CLIENT_SECRET: CLIENT_SECRET,
    DOJO_URL: dojoURL,
    ...env,
  };

  for (const [key, value] of Object.entries(variables)) vi.stubEnv(key, value);

  const config = await buildConfig({
    secret: `${name}-test-secret`,
    serverURL: baseURL,
    db: await getTestDatabaseAdapter({
      sqlite: sqliteAdapter({ client: { url: `file:${join(databaseDir, 'dojo.db')}` } }),
    }),
    admin: { importMap: { autoGenerate: false } },
    typescript: { autoGenerate: false },
    collections: [
      {
        slug: 'users',
        auth: true,
        fields: [{ name: 'name', type: 'text' }],
        ...collection,
      },
    ],
    plugins: [dojo()],
  });

  frogbot = await new FrogBot().init({ config, disableOnInit: !onInit });
  const instance = frogbot;

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

  const users = async (email?: string) =>
    (
      await instance.find({
        collection: 'users',
        ...(email && { where: { email: { equals: email } } }),
        overrideAccess: true,
      })
    ).docs;

  const me = async (response: Response) =>
    (
      await (
        await request('/api/users/me', {
          headers: { cookie: session(response)!, origin: baseURL },
        })
      ).json()
    ).user;

  async function close() {
    for (const server of [app, stub]) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }

    await instance.destroy();
    vi.unstubAllEnvs();
    await rm(databaseDir, { recursive: true, force: true });
  }

  return {
    frogbot: instance,
    config,
    baseURL,
    refusals,
    request,
    signIn,
    session,
    users,
    me,
    close,
  };
}

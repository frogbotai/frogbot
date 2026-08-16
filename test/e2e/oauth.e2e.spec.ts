import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { OAuthProvider } from '@frogbotai/plugin-oauth';
import { oauthPlugin } from '@frogbotai/plugin-oauth';
import { serve } from '@hono/node-server';
import type { FrogbotInstance } from 'frogbot';
import { buildConfig } from 'frogbot';
import { Frogbot } from 'frogbot/test';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { StubOAuthProvider } from '../__helpers/shared/StubOAuthProvider.js';
import {
  pkceChallenge,
  startStubOAuthProvider,
  stubOAuthAccount,
  stubOAuthTokens,
} from '../__helpers/shared/StubOAuthProvider.js';

type ConnectionDoc = {
  id: string | number;
  accountId?: string;
  accountLabel?: string;
  encryptedCredentials?: string;
  owner?: string | number;
  scopes?: string[];
  services?: string[];
  source?: string;
  sourceKey?: string;
  status?: string;
};

type StateDoc = { id: string | number; owner?: string | number | null; provider?: string };

const ownerCredentials = { email: 'owner@example.com', password: 'owner-password' };

function stubProvider(options: {
  id: string;
  service: string;
  signIn?: boolean;
  url: string;
}): OAuthProvider {
  const client = { id: 'stub-client', secret: 'stub-secret' };
  return {
    id: options.id,
    service: options.service,
    label: 'Stub',
    signIn: options.signIn,
    authorizationUrl: `${options.url}/authorize`,
    tokenUrl: `${options.url}/token`,
    scopes: ['profile'],
    authorize: ({ callbackUrl, codeChallenge, state }) => {
      const url = new URL(`${options.url}/authorize`);
      url.search = new URLSearchParams({
        client_id: client.id,
        redirect_uri: callbackUrl,
        response_type: 'code',
        scope: 'profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }).toString();
      return url;
    },
    exchange: async ({ callbackUrl, code, codeVerifier }) => {
      const response = await fetch(`${options.url}/token`, {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          code_verifier: codeVerifier,
          redirect_uri: callbackUrl,
          client_id: client.id,
          client_secret: client.secret,
        }),
      });
      if (!response.ok) throw new Error('token exchange failed');
      const body = (await response.json()) as Record<string, string | number>;
      return {
        accessToken: String(body.access_token),
        refreshToken: body.refresh_token === undefined ? undefined : String(body.refresh_token),
        expiresAt: new Date(Date.now() + Number(body.expires_in) * 1000),
        scopes: String(body.scope).split(' '),
        tokenType: String(body.token_type),
      };
    },
    getAccount: async ({ tokens }) => {
      const response = await fetch(`${options.url}/userinfo`, {
        headers: { authorization: `Bearer ${tokens.accessToken}` },
      });
      if (!response.ok) throw new Error('account lookup failed');
      const body = (await response.json()) as { id: string; email: string; name: string };
      return { id: body.id, email: body.email, name: body.name };
    },
    refresh: async ({ tokens }) => {
      const response = await fetch(`${options.url}/token`, {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokens.refreshToken ?? '',
          client_id: client.id,
          client_secret: client.secret,
        }),
      });
      if (!response.ok) throw new Error('token refresh failed');
      const body = (await response.json()) as Record<string, string | number>;
      return {
        accessToken: String(body.access_token),
        expiresAt: new Date(Date.now() + Number(body.expires_in) * 1000),
        scopes: String(body.scope).split(' '),
        tokenType: String(body.token_type),
      };
    },
    revoke: async ({ tokens }) => {
      await fetch(`${options.url}/revoke`, {
        method: 'POST',
        body: new URLSearchParams({ token: tokens.accessToken }),
      });
    },
  };
}

async function ephemeralPort(): Promise<number> {
  const net = await import('node:net');
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('could not resolve an ephemeral port'));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

describe('OAuth plugin e2e — real server, real provider handshake', () => {
  let provider: StubOAuthProvider;
  let frogbot: FrogbotInstance;
  let baseUrl: string;
  let dataDir: string;
  let closeServer: () => Promise<void>;
  let ownerId: string | number;
  let sessionCookie: string;
  let connectionId: string | number;
  let usedCallbackUrl: string;

  const navigate = (cookie?: string) => ({
    ...(cookie ? { cookie } : {}),
    'sec-fetch-site': 'same-origin' as const,
  });
  const jsonPost = (cookie: string) => ({
    'content-type': 'application/json',
    cookie,
    origin: baseUrl,
    'sec-fetch-site': 'same-origin' as const,
  });

  beforeAll(async () => {
    provider = await startStubOAuthProvider();
    dataDir = mkdtempSync(join(tmpdir(), 'frogbot-oauth-e2e-'));
    const port = await ephemeralPort();
    baseUrl = `http://127.0.0.1:${port}`;

    const config = await buildConfig({
      secret: 'oauth-e2e-secret',
      serverURL: baseUrl,
      db: sqliteAdapter({ client: { url: `file:${join(dataDir, 'oauth-e2e.db')}` } }),
      typescript: { autoGenerate: false },
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'connections', connections: true, fields: [] },
      ],
      plugins: [
        oauthPlugin({
          allowedReturnOrigins: ['https://allowed.example'],
          providers: [
            stubProvider({ id: 'stub', service: 'stub-service', url: provider.url }),
            stubProvider({
              id: 'stub-login',
              service: 'stub-login-service',
              signIn: true,
              url: provider.url,
            }),
          ],
        }),
      ],
    });

    frogbot = await new Frogbot().init({ config });
    const app = new Hono();
    app.all('/api/*', (context) => frogbot.handleRequest(context.req.raw.clone()));
    const server = serve({ fetch: app.fetch, port });
    closeServer = () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );

    const owner = await frogbot.create({
      collection: 'users' as never,
      data: ownerCredentials as never,
    });
    ownerId = (owner as { id: string | number }).id;
    const login = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ownerCredentials),
    });
    sessionCookie = login.headers.get('set-cookie')!.match(/^(frogbot-token=[^;]+)/)![1]!;
  }, 120000);

  afterAll(async () => {
    await closeServer?.();
    await frogbot?.destroy();
    await provider?.close();
    rmSync(dataDir, { force: true, recursive: true });
  });

  async function findConnections(): Promise<ConnectionDoc[]> {
    const result = await frogbot.find({
      collection: 'connections' as never,
      depth: 0,
      showHiddenFields: true,
    } as never);
    return (result as { docs: ConnectionDoc[] }).docs;
  }

  async function findStates(): Promise<StateDoc[]> {
    const result = await frogbot.find({ collection: 'oauth-states' as never, depth: 0 } as never);
    return (result as { docs: StateDoc[] }).docs;
  }

  it('redirects an authenticated connect request to the provider with PKCE and persists state', async () => {
    const response = await fetch(`${baseUrl}/api/users/oauth/stub/authorize?returnUrl=/settings`, {
      headers: navigate(sessionCookie),
      redirect: 'manual',
    });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.origin).toBe(provider.url);
    expect(location.pathname).toBe('/authorize');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('redirect_uri')).toBe(
      `${baseUrl}/api/users/oauth/stub/callback`,
    );

    const states = await findStates();
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ owner: ownerId, provider: 'stub' });
  });

  it('exchanges the provider callback into an encrypted connection', async () => {
    const authorize = await fetch(`${baseUrl}/api/users/oauth/stub/authorize?returnUrl=/settings`, {
      headers: navigate(sessionCookie),
      redirect: 'manual',
    });
    const providerRedirect = await fetch(authorize.headers.get('location')!, {
      redirect: 'manual',
    });
    usedCallbackUrl = providerRedirect.headers.get('location')!;
    expect(new URL(usedCallbackUrl).origin).toBe(baseUrl);

    const callback = await fetch(usedCallbackUrl, { redirect: 'manual' });

    const connections = await findConnections();
    const connection = connections.at(-1)!;
    connectionId = connection.id;
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe(
      `${baseUrl}/settings?oauth_connection=${connection.id}`,
    );
    expect(connection).toMatchObject({
      accountId: stubOAuthAccount.id,
      accountLabel: stubOAuthAccount.name,
      owner: ownerId,
      scopes: ['profile'],
      services: ['stub-service'],
      source: 'oauth',
      sourceKey: 'stub',
      status: 'active',
    });
    expect(connection.encryptedCredentials).not.toContain(stubOAuthTokens.access);

    const exchange = provider.requests.token.at(-1)!;
    expect(exchange.grant_type).toBe('authorization_code');
    expect(pkceChallenge(exchange.code_verifier!)).toBe(
      provider.requests.authorize.at(-1)!.get('code_challenge'),
    );
    expect(provider.requests.account.at(-1)).toBe(`Bearer ${stubOAuthTokens.access}`);
  });

  it('rejects a replayed callback because state is single use', async () => {
    const replay = await fetch(usedCallbackUrl, { redirect: 'manual' });

    expect(replay.status).toBe(400);
    expect(await replay.json()).toEqual({ error: 'OAuth state is invalid or expired' });
    expect(await findStates()).toHaveLength(1);
  });

  it('refreshes the stored credentials through the provider token endpoint', async () => {
    const before = (await findConnections()).find(({ id }) => id === connectionId)!;

    const response = await fetch(`${baseUrl}/api/users/oauth/stub/refresh`, {
      method: 'POST',
      headers: jsonPost(sessionCookie),
      body: JSON.stringify({ connectionId }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: connectionId, status: 'active' });
    expect(provider.requests.token.at(-1)).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: stubOAuthTokens.refresh,
    });
    const after = (await findConnections()).find(({ id }) => id === connectionId)!;
    expect(after.encryptedCredentials).not.toBe(before.encryptedCredentials);
    expect(after.status).toBe('active');
  });

  it('revokes at the provider and clears the stored credentials', async () => {
    const response = await fetch(`${baseUrl}/api/users/oauth/stub/revoke`, {
      method: 'POST',
      headers: jsonPost(sessionCookie),
      body: JSON.stringify({ connectionId }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: connectionId,
      providerRevoked: true,
      status: 'revoked',
    });
    expect(provider.requests.revoke.at(-1)).toEqual({ token: stubOAuthTokens.refreshed });
    const revoked = (await findConnections()).find(({ id }) => id === connectionId)!;
    expect(revoked.status).toBe('revoked');
    expect(revoked.encryptedCredentials).toBe('');
  });

  it('guards authorize against anonymous connects, unknown providers, and foreign return URLs', async () => {
    const anonymous = await fetch(`${baseUrl}/api/users/oauth/stub/authorize`, {
      redirect: 'manual',
    });
    expect(anonymous.status).toBe(401);

    const unknown = await fetch(`${baseUrl}/api/users/oauth/nope/authorize`, {
      headers: navigate(sessionCookie),
      redirect: 'manual',
    });
    expect(unknown.status).toBe(404);

    const foreign = await fetch(
      `${baseUrl}/api/users/oauth/stub/authorize?returnUrl=${encodeURIComponent('https://evil.example/steal')}`,
      { headers: navigate(sessionCookie), redirect: 'manual' },
    );
    expect(foreign.status).toBe(400);

    const allowed = await fetch(
      `${baseUrl}/api/users/oauth/stub/authorize?returnUrl=${encodeURIComponent('https://allowed.example/done')}`,
      { headers: navigate(sessionCookie), redirect: 'manual' },
    );
    expect(allowed.status).toBe(302);
  });

  it('signs a new user in through a sign-in provider instead of storing a connection', async () => {
    const connectionsBefore = (await findConnections()).length;
    const authorize = await fetch(`${baseUrl}/api/users/oauth/stub-login/authorize`, {
      redirect: 'manual',
    });
    expect(authorize.status).toBe(302);
    const pending = (await findStates()).find(({ provider: id }) => id === 'stub-login')!;
    expect(pending.owner ?? null).toBeNull();

    const providerRedirect = await fetch(authorize.headers.get('location')!, {
      redirect: 'manual',
    });
    const callback = await fetch(providerRedirect.headers.get('location')!, { redirect: 'manual' });

    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe(`${baseUrl}/admin`);
    const cookie = callback.headers.get('set-cookie')!.match(/^(frogbot-token=[^;]+)/)![1]!;

    const me = await fetch(`${baseUrl}/api/users/me`, { headers: navigate(cookie) });
    expect(me.status).toBe(200);
    expect((await me.json()).user).toMatchObject({ email: stubOAuthAccount.email });
    expect(await findConnections()).toHaveLength(connectionsBefore);
  });
});

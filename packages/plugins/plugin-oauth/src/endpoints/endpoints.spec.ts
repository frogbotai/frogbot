import type { FrogbotConfig, FrogbotRequest } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import type { OAuthProvider } from '../index.js';
import { oauthPlugin } from '../index.js';

function provider(): OAuthProvider {
  return {
    id: 'custom',
    service: 'custom-service',
    authorizationUrl: 'https://provider.test/authorize',
    tokenUrl: 'https://provider.test/token',
    scopes: ['profile'],
    authorize: ({ state, codeChallenge }) =>
      new URL(`https://provider.test/authorize?state=${state}&code_challenge=${codeChallenge}`),
    exchange: vi.fn().mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' }),
    getAccount: vi.fn().mockResolvedValue({ id: 'account-1', email: 'user@example.com' }),
  };
}

function signInProvider(): OAuthProvider {
  return { ...provider(), signIn: true } as OAuthProvider;
}

async function endpoints(currentProvider = provider()) {
  const config = await oauthPlugin({ providers: [currentProvider], baseUrl: 'https://app.test' })({
    secret: 'test',
    db: {} as FrogbotConfig['db'],
    collections: [{ slug: 'users', auth: true, fields: [] }],
  });
  return config.collections[0]!.endpoints!;
}

describe('OAuth authorize and callback endpoints', () => {
  it('requires auth, rejects open redirects, and ignores RSC probes', async () => {
    const authorize = (await endpoints()).find((endpoint) => endpoint.path.endsWith('/authorize'))!;
    const base = {
      routeParams: { provider: 'custom' },
      headers: new Headers(),
      searchParams: new URLSearchParams(),
      frogbot: {},
    };
    expect((await authorize.handler(base as unknown as FrogbotRequest)).status).toBe(401);
    const open = {
      ...base,
      user: { id: 'user-1' },
      searchParams: new URLSearchParams({ returnUrl: 'https://evil.test' }),
    };
    expect((await authorize.handler(open as unknown as FrogbotRequest)).status).toBe(400);
    const rsc = { ...base, headers: new Headers({ RSC: '1' }) };
    expect((await authorize.handler(rsc as unknown as FrogbotRequest)).status).toBe(204);
  });

  it('allows signed-out users through sign-in providers with ownerless state', async () => {
    const authorize = (await endpoints(signInProvider())).find((endpoint) =>
      endpoint.path.endsWith('/authorize'),
    )!;
    const create = vi.fn().mockResolvedValue({ id: 'state-1' });
    const result = await authorize.handler({
      routeParams: { provider: 'custom' },
      headers: new Headers(),
      searchParams: new URLSearchParams(),
      frogbot: { create },
    } as unknown as FrogbotRequest);
    expect(result.status).toBe(302);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('owner');
  });

  it('keeps signed-in users on the connection path for sign-in providers', async () => {
    const authorize = (await endpoints(signInProvider())).find((endpoint) =>
      endpoint.path.endsWith('/authorize'),
    )!;
    const create = vi.fn().mockResolvedValue({ id: 'state-1' });
    await authorize.handler({
      routeParams: { provider: 'custom' },
      user: { id: 'user-1' },
      headers: new Headers(),
      searchParams: new URLSearchParams(),
      frogbot: { create },
    } as unknown as FrogbotRequest);
    expect(create.mock.calls[0][0].data.owner).toBe('user-1');
  });

  it('sends the mounted collection endpoint URL as the provider callback', async () => {
    const build = async (routes?: { api: string }) => {
      const currentProvider = provider();
      const authorizeSpy = vi.fn(currentProvider.authorize);
      const config = await oauthPlugin({
        providers: [{ ...currentProvider, authorize: authorizeSpy }],
        authCollection: 'accounts',
        baseUrl: 'https://app.test',
      })({
        secret: 'test',
        db: {} as FrogbotConfig['db'],
        collections: [{ slug: 'accounts', auth: true, fields: [] }],
        ...(routes ? { routes } : {}),
      });
      const authorize = config.collections[0]!.endpoints!.find((endpoint) =>
        endpoint.path.endsWith('/authorize'),
      )!;
      await authorize.handler({
        routeParams: { provider: 'custom' },
        user: { id: 'user-1' },
        headers: new Headers(),
        searchParams: new URLSearchParams(),
        frogbot: { create: vi.fn().mockResolvedValue({ id: 'state-1' }) },
      } as unknown as FrogbotRequest);
      return authorizeSpy.mock.calls[0]![0].callbackUrl;
    };

    expect(await build()).toBe('https://app.test/api/accounts/oauth/custom/callback');
    expect(await build({ api: '/rest' })).toBe(
      'https://app.test/rest/accounts/oauth/custom/callback',
    );
  });

  it('persists state and completes the callback once with encrypted tokens', async () => {
    const currentProvider = provider();
    const list = await endpoints(currentProvider);
    const authorize = list.find((endpoint) => endpoint.path.endsWith('/authorize'))!;
    const callback = list.find(
      (endpoint) => endpoint.method === 'get' && endpoint.path.endsWith('/callback'),
    )!;
    const create = vi
      .fn()
      .mockResolvedValueOnce({ id: 'state-1' })
      .mockResolvedValueOnce({ id: 'connection-1' });
    const authorizeReq = {
      routeParams: { provider: 'custom' },
      user: { id: 'user-1' },
      headers: new Headers(),
      searchParams: new URLSearchParams({ returnUrl: '/settings' }),
      frogbot: { create },
    } as unknown as FrogbotRequest;
    const redirect = await authorize.handler(authorizeReq);
    const stateData = create.mock.calls[0][0].data;
    expect(redirect.status).toBe(302);
    expect(stateData.codeVerifier).toBeTruthy();
    const stateDoc = { id: 'state-1', ...stateData };
    const deleteState = vi
      .fn()
      .mockResolvedValueOnce({ docs: [stateDoc] })
      .mockResolvedValueOnce({ docs: [] });
    const callbackReq = {
      method: 'GET',
      routeParams: { provider: 'custom' },
      headers: new Headers(),
      searchParams: new URLSearchParams({ code: 'code', state: stateData.state }),
      frogbot: { delete: deleteState, find: vi.fn().mockResolvedValue({ docs: [] }), create },
    } as unknown as FrogbotRequest;
    const result = await callback.handler(callbackReq);
    expect(result.headers.get('location')).toBe(
      'https://app.test/settings?oauth_connection=connection-1',
    );
    expect(create.mock.calls[1][0].data).toMatchObject({
      services: ['custom-service'],
      source: 'oauth',
      sourceKey: 'custom',
      credentialType: 'oauth2',
      accountId: 'account-1',
    });
    expect(create.mock.calls[1][0].data.encryptedCredentials).not.toContain('access');
    expect(callbackReq.frogbot.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          and: [
            { owner: { equals: 'user-1' } },
            { sourceKey: { equals: 'custom' } },
            { accountId: { equals: 'account-1' } },
          ],
        },
      }),
    );
    expect(currentProvider.exchange as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ codeVerifier: stateData.codeVerifier }),
    );
    expect(deleteState).toHaveBeenCalledWith(expect.objectContaining({ depth: 0 }));
    expect((await callback.handler(callbackReq)).status).toBe(400);
  });

  it('normalizes cancellation and provider failures', async () => {
    const currentProvider = provider();
    (currentProvider.exchange as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('secret provider body'),
    );
    const callback = (await endpoints(currentProvider)).find(
      (endpoint) => endpoint.method === 'get' && endpoint.path.endsWith('/callback'),
    )!;
    const state = {
      id: 'state',
      provider: 'custom',
      owner: 'user',
      returnUrl: 'https://app.test/',
      codeVerifier: 'verifier',
      expiresAt: new Date(Date.now() + 10000).toISOString(),
    };
    const request = (query: Record<string, string>) =>
      ({
        method: 'GET',
        routeParams: { provider: 'custom' },
        headers: new Headers(),
        searchParams: new URLSearchParams(query),
        frogbot: { delete: vi.fn().mockResolvedValue({ docs: [state] }) },
      }) as unknown as FrogbotRequest;
    const cancelled = await callback.handler(request({ state: 'state', error: 'access_denied' }));
    expect(cancelled.headers.get('location')).toContain('oauth_error=access_denied');
    const failed = await callback.handler(request({ state: 'state', code: 'code' }));
    expect(failed.headers.get('location')).toContain('oauth_error=provider_error');
    expect(failed.headers.get('location')).not.toContain('secret');
  });

  it('logs an existing user in without storing a connection or tokens', async () => {
    const currentProvider = signInProvider();
    const callback = (await endpoints(currentProvider)).find(
      (endpoint) => endpoint.method === 'get' && endpoint.path.endsWith('/callback'),
    )!;
    const state = {
      id: 'state',
      provider: 'custom',
      returnUrl: 'https://app.test/',
      codeVerifier: 'verifier',
      expiresAt: new Date(Date.now() + 10000).toISOString(),
    };
    const find = vi.fn().mockResolvedValue({ docs: [{ id: 'user-1', email: 'user@example.com' }] });
    const create = vi.fn();
    const update = vi.fn();
    const req = {
      method: 'GET',
      routeParams: { provider: 'custom' },
      headers: new Headers(),
      searchParams: new URLSearchParams({ state: 'state', code: 'code' }),
      frogbot: { delete: vi.fn().mockResolvedValue({ docs: [state] }), find, create, update },
      payload: {
        secret: 'secret',
        config: { cookiePrefix: 'frogbot' },
        collections: { users: { config: authCollection() } },
      },
      context: {},
    } as unknown as FrogbotRequest;
    const result = await callback.handler(req);
    expect(result.status).toBe(302);
    expect(result.headers.get('set-cookie')).toContain('frogbot-token=');
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        where: { email: { equals: 'user@example.com' } },
      }),
    );
    expect(create).not.toHaveBeenCalledWith(expect.objectContaining({ collection: 'connections' }));
    expect(update).not.toHaveBeenCalled();
  });

  it('creates verified users with random passwords before login', async () => {
    const currentProvider = signInProvider();
    const callback = (await endpoints(currentProvider)).find(
      (endpoint) => endpoint.method === 'get' && endpoint.path.endsWith('/callback'),
    )!;
    const state = {
      id: 'state',
      provider: 'custom',
      returnUrl: 'https://app.test/',
      codeVerifier: 'verifier',
      expiresAt: new Date(Date.now() + 10000).toISOString(),
    };
    const user = { id: 'user-1', email: 'user@example.com', _verified: true };
    const create = vi.fn().mockResolvedValue(user);
    const req = callbackRequest({
      state,
      find: vi.fn().mockResolvedValue({ docs: [] }),
      create,
      auth: authCollection({ verify: true }),
    });
    const result = await callback.handler(req);
    expect(result.status).toBe(302);
    const userWrite = create.mock.calls.find(([args]) => args.collection === 'users')?.[0];
    expect(userWrite.data).toMatchObject({ email: 'user@example.com', _verified: true });
    expect(userWrite.data.password).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(create).not.toHaveBeenCalledWith(expect.objectContaining({ collection: 'connections' }));
  });

  it('redirects safely when a sign-in account has no email', async () => {
    const currentProvider = signInProvider();
    (currentProvider.getAccount as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'account-1' });
    const callback = (await endpoints(currentProvider)).find(
      (endpoint) => endpoint.method === 'get' && endpoint.path.endsWith('/callback'),
    )!;
    const state = {
      id: 'state',
      provider: 'custom',
      returnUrl: 'https://app.test/',
      codeVerifier: 'verifier',
      expiresAt: new Date(Date.now() + 10000).toISOString(),
    };
    const find = vi.fn();
    const create = vi.fn();
    const result = await callback.handler(callbackRequest({ state, find, create }));
    expect(result.headers.get('location')).toContain('oauth_error=');
    expect(find).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ['unverified', { _verified: false }, { verify: true }],
    [
      'locked',
      { lockUntil: new Date(Date.now() + 10000).toISOString(), loginAttempts: 5 },
      { maxLoginAttempts: 5 },
    ],
  ])('rejects %s users', async (_name, userFields, auth) => {
    const currentProvider = signInProvider();
    const callback = (await endpoints(currentProvider)).find(
      (endpoint) => endpoint.method === 'get' && endpoint.path.endsWith('/callback'),
    )!;
    const state = {
      id: 'state',
      provider: 'custom',
      returnUrl: 'https://app.test/',
      codeVerifier: 'verifier',
      expiresAt: new Date(Date.now() + 10000).toISOString(),
    };
    const user = { id: 'user-1', email: 'user@example.com', ...userFields };
    const find = vi.fn().mockResolvedValue({ docs: [user] });
    const result = await callback.handler(
      callbackRequest({ state, find, auth: authCollection(auth) }),
    );
    expect(result.headers.get('location')).toContain('oauth_error=');
    expect(result.headers.get('set-cookie')).toBeNull();
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'users' }));
  });
});

function authCollection(auth: Record<string, unknown> = {}) {
  return {
    slug: 'users',
    fields: [],
    hooks: { beforeLogin: [], afterLogin: [] },
    auth: {
      maxLoginAttempts: 0,
      tokenExpiration: 7200,
      useSessions: false,
      verify: false,
      cookies: { sameSite: 'Lax', secure: false },
      ...auth,
    },
  };
}

function callbackRequest({
  state,
  find = vi.fn().mockResolvedValue({ docs: [] }),
  create = vi.fn(),
  auth = authCollection(),
}: {
  state: Record<string, unknown>;
  find?: ReturnType<typeof vi.fn>;
  create?: ReturnType<typeof vi.fn>;
  auth?: ReturnType<typeof authCollection>;
}) {
  return {
    method: 'GET',
    routeParams: { provider: 'custom' },
    headers: new Headers(),
    searchParams: new URLSearchParams({ state: 'state', code: 'code' }),
    frogbot: {
      delete: vi.fn().mockResolvedValue({ docs: [state] }),
      find,
      create,
      update: vi.fn(),
    },
    payload: {
      secret: 'secret',
      config: { cookiePrefix: 'frogbot' },
      collections: { users: { config: auth } },
    },
    context: {},
  } as unknown as FrogbotRequest;
}

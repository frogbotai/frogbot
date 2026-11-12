import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCredentialEncryption } from '../../../../packages/frogbot/src/connections/encryption.js';
import { buildConnectionOAuthEndpoints } from '../../../../packages/frogbot/src/connections/endpoints.js';
import type { SanitizedConnectionsConfig } from '../../../../packages/frogbot/src/connections/types.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import type { OAuthTokens, PieceOAuthSave } from '../../../../packages/frogbot/src/pieces/types.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';
import { definition, setup } from './oauth/fixtures.js';

function fixture(pieceDefinition: Parameters<typeof setup>[0] = definition) {
  const base = setup(pieceDefinition);
  const upsert = vi.fn().mockResolvedValue({ id: 'connection' });
  const findByID = vi.fn().mockResolvedValue({ id: 'owner' });
  const config = {
    serverURL: 'https://app.test',
    routes: { api: '/rest/v1', admin: '/control' },
  };

  const connections: SanitizedConnectionsConfig = {
    enabled: true,
    slug: 'connections',
    encryption: base.encryption,
    entries: { example: { piece: base.piece, oauth: true, secret: true } },
    apps: {},
  };

  const endpoints = buildConnectionOAuthEndpoints({ connections, userSlug: 'users' });
  const request = ({
    url = 'https://untrusted.test/rest/v1/connections/example/authorize',
    user = base.req.user,
    cookie = '',
    piece = 'example',
  }: { url?: string; user?: FrogBotRequest['user']; cookie?: string; piece?: string } = {}) =>
    ({
      url,
      user,
      routeParams: { piece },
      headers: new Headers({ cookie }),
      frogbot: {
        kv: base.kv,
        config: { _internal: { payloadConfig: Promise.resolve(config) } },
        connections: { store: Promise.resolve({ upsert }) },
        findByID,
      },
    }) as unknown as FrogBotRequest;

  const start = async (query = '') => {
    const response = await endpoints[0].handler(
      request({ url: `https://app.test/authorize${query}` }),
    );

    expect(response.status).toBe(302);

    const provider = new URL(response.headers.get('location')!);
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    const url = `${provider.searchParams.get('redirect_uri')}?state=${provider.searchParams.get('state')}&code=private-code`;

    return { response, provider, cookie, url };
  };

  const fetch = vi
    .fn()
    .mockImplementation(() => Promise.resolve(Response.json({ access_token: 'fresh-token' })));

  vi.stubGlobal('fetch', fetch);

  return { ...base, upsert, findByID, config, connections, endpoints, request, start, fetch };
}

type Fixture = ReturnType<typeof fixture>;

type FixtureRequest = FrogBotRequest;

describe('OAuth linking endpoints', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('mounts the user and app slot authorize routes and one callback', () => {
    const { endpoints, connections } = fixture();

    expect(endpoints.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'get', path: '/:piece/authorize' },
      { method: 'get', path: '/:piece/callback' },
      { method: 'get', path: '/app/:app/:piece/authorize' },
    ]);
    expect(
      buildConnectionOAuthEndpoints({
        connections: { ...connections, enabled: false },
        userSlug: 'users',
      }),
    ).toEqual([]);
  });

  it.each([null, { id: 'owner', collection: 'customers' }])(
    'requires the admin owner to authorize: %j',
    async (user) => {
      const f = fixture();
      const response = await f.endpoints[0].handler(f.request({ user }));

      expect(response.status).toBe(user ? 403 : 401);
      expect(f.values.size).toBe(0);
    },
  );

  it.each(['unknown', '__proto__', 'configured'])(
    'returns 404 for unknown or noncanonical route %s',
    async (piece) => {
      const f = fixture();

      for (const endpoint of f.endpoints) {
        expect((await endpoint.handler(f.request({ piece }))).status).toBe(404);
      }
    },
  );

  it('revalidates OAuth enablement on each route', async () => {
    const f = fixture();
    const flow = await f.start();
    f.connections.entries.example.oauth = false;

    for (const endpoint of f.endpoints) {
      expect((await endpoint.handler(f.request(flow))).status).toBe(404);
    }

    expect(f.fetch).not.toHaveBeenCalled();
  });

  it.each<[string, (f: Fixture) => void]>([
    [
      'origin',
      (f) => {
        f.config.serverURL = 'https://other.test';
      },
    ],
    [
      'prefix',
      (f) => {
        f.config.routes.api = '/other';
      },
    ],
    [
      'instance',
      (f) => {
        f.connections.entries.example.piece = definePiece(definition)({
          slug: 'other-instance',
          oauth: f.piece.oauth,
        });
      },
    ],
  ])('rejects a callback whose %s binding changed after authorization', async (_kind, change) => {
    const f = fixture();
    const flow = await f.start();
    change(f);

    expect((await f.endpoints[1].handler(f.request(flow))).status).toBe(400);
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.upsert).not.toHaveBeenCalled();
  });

  it('uses configured origin, API prefix and default settings return route with PKCE', async () => {
    const f = fixture();
    const flow = await f.start();

    expect(flow.provider.searchParams.get('redirect_uri')).toBe(
      'https://app.test/rest/v1/connections/example/callback',
    );
    expect(flow.provider.searchParams.get('code_challenge_method')).toBe('S256');
    expect(flow.response.headers.get('cache-control')).toBe('no-store');
    expect(f.upsert).not.toHaveBeenCalled();

    const response = await f.endpoints[1].handler(f.request(flow));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/control/settings/connections');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(response.headers.get('cache-control')).toBe('no-store');

    const body = f.fetch.mock.calls[0][1].body as URLSearchParams;

    expect(body.get('redirect_uri')).toBe(flow.provider.searchParams.get('redirect_uri'));
    expect(body.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(f.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: { id: 'owner', collection: 'users' },
        method: 'oauth',
        credential: { access_token: 'fresh-token' },
        scopes: ['read'],
      }),
    );
  });

  it.each([
    '/elsewhere?tab=connections#linked',
    'https://app.test/elsewhere?tab=connections#linked',
  ])('preserves safe returnTo %s', async (returnTo) => {
    const f = fixture();
    const flow = await f.start(`?returnTo=${encodeURIComponent(returnTo)}`);

    expect((await f.endpoints[1].handler(f.request(flow))).headers.get('location')).toBe(
      '/elsewhere?tab=connections#linked',
    );
  });

  it.each(['https://evil.test/', '//evil.test/', '/\\evil.test/', '', '/ok\n'])(
    'rejects unsafe returnTo %j before storing state',
    async (returnTo) => {
      const f = fixture();
      const response = await f.endpoints[0].handler(
        f.request({ url: `https://app.test/authorize?returnTo=${encodeURIComponent(returnTo)}` }),
      );

      expect(response.status).toBe(400);
      expect(f.values.size).toBe(0);
    },
  );

  it.each([
    'https://user:private@app.test',
    'javascript:alert(1)',
    'https://app.test/?secret=value',
  ])('fails closed on unsafe serverURL %s', async (serverURL) => {
    const f = fixture();
    f.config.serverURL = serverURL;
    const response = await f.endpoints[0].handler(f.request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Connection operation failed' });
    expect(f.values.size).toBe(0);
  });

  it('supports root admin and API routes and a request-origin fallback', async () => {
    const f = fixture();
    Object.assign(f.config, { serverURL: '', routes: { api: '/', admin: '/' } });
    const flow = await f.start();

    expect(flow.provider.searchParams.get('redirect_uri')).toBe(
      'https://app.test/connections/example/callback',
    );

    const response = await f.endpoints[1].handler(f.request(flow));

    expect(response.headers.get('location')).toBe('/settings/connections');
  });

  it('allows a browser-bound cross-site callback without req.user and rejects replay', async () => {
    const f = fixture();
    const flow = await f.start();

    expect((await f.endpoints[1].handler(f.request({ ...flow, user: null }))).status).toBe(302);
    expect((await f.endpoints[1].handler(f.request(flow))).status).toBe(400);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(f.findByID).toHaveBeenCalledWith({
      collection: 'users',
      id: 'owner',
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    });
  });

  it('claims state before exchange and persists only after account validation finishes', async () => {
    let finish!: () => void;
    let accountStarted!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });

    const started = new Promise<void>((resolve) => {
      accountStarted = resolve;
    });

    const f = fixture({
      ...definition,
      oauth: {
        ...definition.oauth,
        account: async () => {
          accountStarted();
          await pending;

          return { id: 'account', label: 'Account' };
        },
      },
    });

    const flow = await f.start();

    f.fetch.mockImplementationOnce(async () => {
      expect((await f.endpoints[1].handler(f.request(flow))).status).toBe(400);
      expect(f.upsert).not.toHaveBeenCalled();

      return Response.json({ access_token: 'fresh-token' });
    });

    const response = f.endpoints[1].handler(f.request(flow));
    await started;

    expect(f.upsert).not.toHaveBeenCalled();

    finish();

    expect((await response).status).toBe(302);
    expect(f.upsert).toHaveBeenCalledTimes(1);
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it.each<[string, (req: FixtureRequest) => void]>([
    [
      'owner',
      (req) => {
        req.user = { id: 'other', collection: 'users' };
      },
    ],
    [
      'collection',
      (req) => {
        req.user = { id: 'owner', collection: 'customers' };
      },
    ],
    ['browser', (req) => req.headers.delete('cookie')],
  ])(
    'rejects %s mismatch without consuming the legitimate browser intent',
    async (_kind, change) => {
      const f = fixture();
      const flow = await f.start();
      const req = f.request(flow);
      change(req);

      expect((await f.endpoints[1].handler(req)).status).toBe(400);
      expect(f.fetch).not.toHaveBeenCalled();
      expect((await f.endpoints[1].handler(f.request(flow))).status).toBe(302);
    },
  );

  it.each<{ kind: string; status: number; upserts: number; fail: (f: Fixture, url: URL) => void }>([
    {
      kind: 'denied',
      status: 400,
      upserts: 0,
      fail: (_f, url) => url.searchParams.set('error', 'private-provider-error'),
    },
    {
      kind: 'missing-code',
      status: 400,
      upserts: 0,
      fail: (_f, url) => url.searchParams.delete('code'),
    },
    {
      kind: 'duplicate-code',
      status: 400,
      upserts: 0,
      fail: (_f, url) => url.searchParams.append('code', 'private-code-2'),
    },
    {
      kind: 'deleted-owner',
      status: 400,
      upserts: 0,
      fail: (f) => f.findByID.mockResolvedValue(null),
    },
    {
      kind: 'provider',
      status: 400,
      upserts: 0,
      fail: (f) => f.fetch.mockRejectedValue(new Error('private-client-secret')),
    },
    {
      kind: 'storage',
      status: 500,
      upserts: 1,
      fail: (f) => f.upsert.mockRejectedValue(new Error('private-refresh-token')),
    },
  ])(
    'consumes and clears cookies on a valid failed callback: $kind',
    async ({ status, upserts, fail }) => {
      const f = fixture();
      const flow = await f.start();
      const url = new URL(flow.url);
      fail(f, url);
      const response = await f.endpoints[1].handler(f.request({ ...flow, url: url.href }));

      expect(response.status).toBe(status);
      expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ error: 'Connection operation failed' });
      expect(f.upsert).toHaveBeenCalledTimes(upserts);

      const calls = f.fetch.mock.calls.length;

      expect((await f.endpoints[1].handler(f.request(flow))).status).toBe(400);
      expect(f.fetch).toHaveBeenCalledTimes(calls);
    },
  );

  it.each(['auth', 'account'])('validates fresh-token %s before persistence', async (kind) => {
    const f = fixture({
      ...definition,
      oauth: {
        ...definition.oauth,
        ...(kind === 'auth'
          ? { toAuth: () => ({ token: 42 }) }
          : { account: () => Promise.resolve({ id: '', label: 'private-token' }) }),
      },
    });

    const flow = await f.start();
    const response = await f.endpoints[1].handler(f.request(flow));

    expect(response.status).toBe(400);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(f.upsert).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: 'Connection operation failed' });
  });
});

describe('piece-run sign-in endpoints', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function signInFixture() {
    const authorize = vi.fn(
      (_args: { req: FrogBotRequest; returnTo: string; save: PieceOAuthSave }) =>
        Promise.resolve('http://127.0.0.1:1455/provider'),
    );

    const piece = definePiece({
      ...definition,
      oauth: {
        scopes: { catalog: { read: 'read' }, defaults: ['read'] },
        toAuth: ({ tokens }) => ({ token: tokens.access_token }),
        authorize,
        refresh: ({ tokens }) => Promise.resolve(tokens),
      },
    })();

    const upsert = vi.fn().mockResolvedValue({ id: 'connection' });
    const findByID = vi.fn().mockResolvedValue({ id: 'owner' });
    const fetch = vi.fn();
    const config = {
      serverURL: 'https://configured.test',
      routes: { api: '/api', admin: '/admin' },
    };

    const connections: SanitizedConnectionsConfig = {
      enabled: true,
      slug: 'connections',
      encryption: createCredentialEncryption({ secret: 'state-secret' }),
      entries: { example: { piece, oauth: true, secret: false } },
      apps: {},
    };

    vi.stubGlobal('fetch', fetch);

    const endpoints = buildConnectionOAuthEndpoints({ connections, userSlug: 'users' });
    const request = (url: string) =>
      ({
        url,
        user: { id: 'owner', collection: 'users' },
        routeParams: { piece: 'example' },
        headers: new Headers(),
        frogbot: {
          config: { _internal: { payloadConfig: Promise.resolve(config) } },
          connections: { store: Promise.resolve({ upsert }) },
          findByID,
        },
      }) as unknown as FrogBotRequest;

    return { authorize, upsert, findByID, fetch, endpoints, request };
  }

  it('calls authorize with an absolute returnTo at the request origin and redirects', async () => {
    const f = signInFixture();
    const response = await f.endpoints[0].handler(
      f.request('http://localhost:3000/api/connections/example/authorize?returnTo=%2Fadmin%2Fx'),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://127.0.0.1:1455/provider');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(f.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ returnTo: 'http://localhost:3000/admin/x' }),
    );
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it('defaults returnTo to the Linked accounts page', async () => {
    const f = signInFixture();

    await f.endpoints[0].handler(
      f.request('http://localhost:3000/api/connections/example/authorize'),
    );

    expect(f.authorize.mock.calls[0][0].returnTo).toBe(
      'http://localhost:3000/admin/settings/connections',
    );
  });

  it.each(['https://evil.test/', '//evil.test/', 'https://configured.test/admin'])(
    'refuses returnTo %s on another origin',
    async (returnTo) => {
      const f = signInFixture();
      const response = await f.endpoints[0].handler(
        f.request(
          `http://localhost:3000/api/connections/example/authorize?returnTo=${encodeURIComponent(returnTo)}`,
        ),
      );

      expect(response.status).toBe(400);
      expect(f.authorize).not.toHaveBeenCalled();
    },
  );

  it('answers 404 on the core callback route', async () => {
    const f = signInFixture();
    const response = await f.endpoints[1].handler(
      f.request('http://localhost:3000/api/connections/example/callback?state=x&code=y'),
    );

    expect(response.status).toBe(404);
  });

  it("saves the starting user's row through save", async () => {
    const f = signInFixture();

    await f.endpoints[0].handler(
      f.request('http://localhost:3000/api/connections/example/authorize'),
    );

    await f.authorize.mock.calls[0][0].save({
      tokens: { access_token: 'signed-in', scope: 'read' },
      account: { id: 'sub', label: 'user@example.com', email: 'User@Example.com' },
    });

    expect(f.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'users', id: 'owner' }),
    );
    expect(f.upsert).toHaveBeenCalledWith({
      owner: { id: 'owner', collection: 'users' },
      piece: 'example',
      method: 'oauth',
      credential: { access_token: 'signed-in', scope: 'read' },
      account: { id: 'sub', label: 'user@example.com', email: 'user@example.com' },
      scopes: ['read'],
      expiresAt: null,
    });
  });

  it.each<[string, (f: ReturnType<typeof signInFixture>) => void, OAuthTokens]>([
    ['a deleted user', (f) => f.findByID.mockResolvedValue(null), { access_token: 'token' }],
    ['tokens with no access token', () => {}, { refresh_token: 'refresh' }],
  ])('saves nothing for %s', async (_kind, change, tokens) => {
    const f = signInFixture();

    change(f);

    await f.endpoints[0].handler(
      f.request('http://localhost:3000/api/connections/example/authorize'),
    );

    await expect(
      f.authorize.mock.calls[0][0].save({ tokens, account: { id: 'sub', label: 'Account' } }),
    ).rejects.toThrow('OAuth');
    expect(f.upsert).not.toHaveBeenCalled();
  });
});

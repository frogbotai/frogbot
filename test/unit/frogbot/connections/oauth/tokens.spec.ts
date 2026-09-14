import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  exchangeOAuthCode,
  lookupOAuthAccount,
  oauthTokenMetadata,
  parseOAuthTokens,
  refreshOAuthTokens,
} from '../../../../../packages/frogbot/src/connections/oauth/tokens.js';
import type { FrogbotRequest } from '../../../../../packages/frogbot/src/types/request.js';
import { definition, setup } from './fixtures.js';

describe('OAuth token and account transport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('exchanges the code with the callback, app credentials and verifier, retaining vendor fields', async () => {
    const { piece } = setup();
    const fetch = vi.fn(async () =>
      Response.json({
        access_token: 'fresh',
        expires_in: '3600',
        refresh_token: 'refresh',
        vendor: { tenant: ['one'] },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const tokens = await exchangeOAuthCode({
      piece,
      code: 'code',
      callbackUrl: 'https://app.test/callback',
      verifier: 'v'.repeat(43),
    });
    expect(tokens).toEqual({
      access_token: 'fresh',
      expires_in: 3600,
      refresh_token: 'refresh',
      vendor: { tenant: ['one'] },
    });
    const [url, request] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('https://provider.test/token');
    expect(Object.fromEntries(request.body as URLSearchParams)).toEqual({
      grant_type: 'authorization_code',
      code: 'code',
      redirect_uri: 'https://app.test/callback',
      client_id: 'client',
      client_secret: 'secret',
      code_verifier: 'v'.repeat(43),
    });
    expect(request).toMatchObject({
      method: 'POST',
      redirect: 'error',
    });
    expect(new Headers(request.headers).get('accept')).toBe('application/json');
    expect(new Headers(request.headers).has('authorization')).toBe(false);
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it('exchanges the code with HTTP Basic app credentials outside the request body', async () => {
    const { piece } = setup(
      {
        ...definition,
        oauth: { ...definition.oauth, tokenEndpointAuthMethod: 'client_secret_basic' },
      },
      { clientId: 'client:id %é', clientSecret: 'secret:% snow☃' },
    );
    const fetch = vi.fn(async () => Response.json({ access_token: 'fresh' }));
    vi.stubGlobal('fetch', fetch);

    await exchangeOAuthCode({
      piece,
      code: 'code',
      callbackUrl: 'https://app.test/callback',
      verifier: 'v'.repeat(43),
    });

    const [, request] = fetch.mock.calls[0]! as unknown as [string, RequestInit];

    expect(new Headers(request.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('client%3Aid+%25%C3%A9:secret%3A%25+snow%E2%98%83').toString('base64')}`,
    );
    expect(Object.fromEntries(request.body as URLSearchParams)).toEqual({
      grant_type: 'authorization_code',
      code: 'code',
      redirect_uri: 'https://app.test/callback',
      code_verifier: 'v'.repeat(43),
    });
  });

  it.each([undefined, 'short', 'a'.repeat(129), '!'.repeat(43)])(
    'rejects missing or invalid PKCE verifier %s before transport',
    async (verifier) => {
      const { piece } = setup();
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      await expect(
        exchangeOAuthCode({
          piece,
          code: 'code',
          callbackUrl: 'https://app.test/callback',
          verifier,
        }),
      ).rejects.toMatchObject({ code: 'tokens' });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    [],
    {},
    { access_token: '' },
    { access_token: '   ' },
    { access_token: 1 },
    { access_token: 'token', expires_in: -1 },
    { access_token: 'token', expires_in: 'NaN' },
    { access_token: 'token', expires_in: '' },
    { access_token: 'token', expires_in: null },
    { access_token: 'token', expires_in: Infinity },
    { access_token: 'token', expires_in: 1e20 },
    { access_token: 'token', refresh_token: null },
    { access_token: 'token', scope: ['read'] },
    { access_token: 'token', token_type: false },
    { access_token: 'token', error: 'secret-error' },
    { access_token: 'token', error_description: 'secret-error' },
    { access_token: 'token', vendor: { fn() {} } },
  ])('rejects malformed token response %j with a redacted error', (value) => {
    expect(() => parseOAuthTokens(value)).toThrow('OAuth tokens validation failed.');
  });

  it.each(['http', 'json', 'oauth', 'network'])('redacts %s exchange errors', async (kind) => {
    const { piece } = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (kind === 'network') throw new Error('secret-error');
        if (kind === 'json') return new Response('secret-error');
        return Response.json(
          { error: 'invalid_grant', error_description: 'secret-error' },
          { status: kind === 'http' ? 400 : 200 },
        );
      }),
    );
    await expect(
      exchangeOAuthCode({
        piece,
        code: 'code',
        callbackUrl: 'https://app.test/callback',
        verifier: 'v'.repeat(43),
      }),
    ).rejects.toThrow('OAuth tokens validation failed.');
  });

  it('times out an unresponsive transport and aborts the request', async () => {
    vi.useFakeTimers();
    const { piece } = setup();
    let signal!: AbortSignal;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, request) => {
        signal = request.signal;
        return new Promise(() => {});
      }),
    );
    const pending = exchangeOAuthCode({
      piece,
      code: 'code',
      callbackUrl: 'https://app.test/callback',
      verifier: 'v'.repeat(43),
    });
    const outcome = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await outcome).toMatchObject({ code: 'tokens' });
    expect(signal.aborted).toBe(true);
  });

  it.each([
    ['account', 'deadline'],
    ['account', 'request'],
    ['account', 'lease'],
    ['refresh', 'deadline'],
    ['refresh', 'request'],
    ['refresh', 'lease'],
  ])(
    'aborts actual %s callback fetch on %s cancellation while retaining the request',
    async (operation, cancellation) => {
      const server = createServer();
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      vi.useFakeTimers();
      const requestAbort = new AbortController();
      const leaseAbort = new AbortController();
      let received!: FrogbotRequest;
      let transport!: Promise<Response>;
      const run = async ({ req }: { req: FrogbotRequest }) => {
        received = req;
        transport = fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, {
          signal: req.signal,
        });
        await transport;
      };
      const fixture = setup({
        ...definition,
        oauth: {
          ...definition.oauth,
          account: async (args) => {
            await run(args);
            return { id: 'id', label: 'label' };
          },
          refresh: async (args) => {
            await run(args);
            return { access_token: 'fresh' };
          },
        },
      });
      const req = Object.assign(
        new Request('https://app.test/callback', {
          method: 'POST',
          body: JSON.stringify({ value: 'body' }),
          headers: { 'content-type': 'application/json' },
          signal: requestAbort.signal,
        }),
        {
          user: fixture.req.user,
          context: { tenant: 'one' },
          frogbot: {},
          transactionID: 'transaction',
        },
      ) as FrogbotRequest;
      const metadata = Symbol('metadata');
      Object.defineProperty(req, metadata, { value: { hidden: true } });
      const accepted = once(server, 'request');
      const outcome = (operation === 'account' ? lookupOAuthAccount : refreshOAuthTokens)({
        piece: fixture.piece,
        tokens: { access_token: 'old' },
        req,
        signal: leaseAbort.signal,
      }).catch((error: unknown) => error);
      try {
        await accepted;
        expect(received).toBeInstanceOf(Request);
        expect(received).not.toBe(req);
        expect(received.context).toBe(req.context);
        expect(received.frogbot).toBe(req.frogbot);
        expect(received.user).toBe(req.user);
        expect(received.headers).toBe(req.headers);
        expect(received.url).toBe(req.url);
        expect(received.transactionID).toBe('transaction');
        expect(Reflect.get(received, metadata)).toBe(Reflect.get(req, metadata));
        expect(await received.clone().json()).toEqual({ value: 'body' });
        expect(await received.json()).toEqual({ value: 'body' });
        expect(req.bodyUsed).toBe(true);
        expect(received.signal).not.toBe(req.signal);
        const fetchOutcome = transport.catch((error: unknown) => error);
        if (cancellation === 'deadline') await vi.advanceTimersByTimeAsync(15_000);
        else if (cancellation === 'request') requestAbort.abort();
        else leaseAbort.abort();
        expect(await outcome).toMatchObject({
          code: operation === 'account' ? 'account' : 'tokens',
        });
        expect(await fetchOutcome).toMatchObject({ name: 'AbortError' });
        expect(received.signal.aborted).toBe(true);
        expect(req.signal.aborted).toBe(cancellation === 'request');
      } finally {
        requestAbort.abort();
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }
    },
  );

  it('constructs the account client from freshly parsed auth and factory options without resolving credentials', async () => {
    const client = vi.fn(({ auth, options }) => ({ token: auth.token, region: options.region }));
    const account = vi.fn(async ({ client }) => ({
      id: client.token,
      label: client.region,
      email: 'user@example.test',
    }));
    const { piece, req } = setup({
      ...definition,
      client,
      oauth: { ...definition.oauth, account },
    });
    const existingClient = vi
      .spyOn(piece, 'client')
      .mockRejectedValue(new Error('must not resolve existing credentials'));
    const tokens = { access_token: 'freshly-exchanged' };
    await expect(lookupOAuthAccount({ piece, tokens, req })).resolves.toEqual({
      id: 'freshly-exchanged',
      label: 'west',
      email: 'user@example.test',
    });
    expect(client).toHaveBeenCalledWith({
      auth: { token: 'freshly-exchanged' },
      options: { region: 'west' },
    });
    expect(account).toHaveBeenCalledWith({
      tokens,
      client: { token: 'freshly-exchanged', region: 'west' },
      req,
    });
    expect(existingClient).not.toHaveBeenCalled();
  });

  it('validates auth even without account lookup and rejects malformed accounts', async () => {
    const { piece, req } = setup();
    await expect(
      lookupOAuthAccount({ piece, req, tokens: { access_token: 'fresh' } }),
    ).resolves.toBeUndefined();
    const invalid = setup({
      ...definition,
      oauth: { ...definition.oauth, account: async () => ({ id: '', label: 'secret-error' }) },
    });
    await expect(
      lookupOAuthAccount({ ...invalid, tokens: { access_token: 'fresh' } }),
    ).rejects.toThrow('OAuth account validation failed.');
    const auth = setup({
      ...definition,
      oauth: { ...definition.oauth, toAuth: () => ({ token: '' }) },
    });
    await expect(
      lookupOAuthAccount({ ...auth, tokens: { access_token: 'fresh' } }),
    ).rejects.toMatchObject({ code: 'tokens' });
  });

  it('refreshes using the app and preserves omitted refresh tokens, scope and vendor fields', async () => {
    const fixture = setup();
    const fetch = vi.fn(async () =>
      Response.json({ access_token: 'fresh', expires_in: 3600, new_vendor: true }),
    );
    vi.stubGlobal('fetch', fetch);
    const tokens = await refreshOAuthTokens({
      ...fixture,
      tokens: {
        access_token: 'old',
        refresh_token: 'refresh',
        scope: 'read',
        vendor: { tenant: 'one' },
      },
    });
    expect(tokens).toEqual({
      access_token: 'fresh',
      refresh_token: 'refresh',
      scope: 'read',
      vendor: { tenant: 'one' },
      new_vendor: true,
      expires_in: 3600,
    });
    const [, request] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
    expect(Object.fromEntries(request.body as URLSearchParams)).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'refresh',
      client_id: 'client',
      client_secret: 'secret',
    });
  });

  it('uses recipe refresh and never extends an old expires_in when omitted', async () => {
    const refresh = vi.fn(async () => ({ access_token: 'custom', refresh_token: undefined }));
    const fixture = setup({ ...definition, oauth: { ...definition.oauth, refresh } });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const current = {
      access_token: 'old',
      refresh_token: 'refresh',
      expires_in: 300,
      vendor: true,
    };
    const tokens = await refreshOAuthTokens({ ...fixture, tokens: current });
    expect(refresh).toHaveBeenCalledWith({ tokens: current, req: fixture.req });
    expect(tokens).toEqual({ access_token: 'custom', refresh_token: 'refresh', vendor: true });
    expect(oauthTokenMetadata({ tokens, scopes: ['read'] })).toEqual({
      scopes: ['read'],
      expiresAt: null,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refreshes with HTTP Basic app credentials outside the request body', async () => {
    const fixture = setup(
      {
        ...definition,
        oauth: { ...definition.oauth, tokenEndpointAuthMethod: 'client_secret_basic' },
      },
      { clientId: 'client:id %é', clientSecret: 'secret:% snow☃' },
    );
    const fetch = vi.fn(async () => Response.json({ access_token: 'fresh' }));
    vi.stubGlobal('fetch', fetch);

    await refreshOAuthTokens({
      ...fixture,
      tokens: { access_token: 'old', refresh_token: 'refresh' },
    });

    const [, request] = fetch.mock.calls[0]! as unknown as [string, RequestInit];

    expect(new Headers(request.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('client%3Aid+%25%C3%A9:secret%3A%25+snow%E2%98%83').toString('base64')}`,
    );
    expect(Object.fromEntries(request.body as URLSearchParams)).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'refresh',
    });
  });
});

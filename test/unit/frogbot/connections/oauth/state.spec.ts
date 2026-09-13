import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  consumeOAuthState,
  createOAuthState,
} from '../../../../../packages/frogbot/src/connections/oauth/state.js';
import { exchangeOAuthCode } from '../../../../../packages/frogbot/src/connections/oauth/tokens.js';
import { definition, setup } from './fixtures.js';

async function begin(fixture = setup()) {
  const started = await createOAuthState({
    ...fixture,
    ...fixture.binding,
    returnTo: '/settings?tab=accounts#linked',
  });
  fixture.req.headers.set('cookie', started.setCookie.split(';')[0]!);
  const args = { ...fixture, ...fixture.binding, state: started.state };
  return { ...fixture, ...started, args };
}

describe('OAuth browser state', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('encrypts intent, binds the browser, and uses random S256 PKCE', async () => {
    const flow = await begin();
    const second = await begin();
    expect(flow.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second.state).not.toBe(flow.state);
    expect(flow.setCookie).toContain('__Host-frogbot-oauth-');
    expect(flow.setCookie).toContain('Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure');
    expect(flow.values.get(`oauth:state:${flow.state}`)).not.toContain('owner');
    const { intent, clearCookie } = await consumeOAuthState(flow.args);
    const params = new URL(flow.authorizationUrl).searchParams;
    expect(params.get('code_challenge')).toBe(
      createHash('sha256').update(intent.verifier!).digest('base64url'),
    );
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('state')).toBe(flow.state);
    expect(intent.returnTo).toBe('/settings?tab=accounts#linked');
    expect(clearCookie).toContain('Max-Age=0; Secure');
    expect(flow.adapter.setIfAbsent).toHaveBeenLastCalledWith(
      `oauth:consumed:${flow.state}`,
      true,
      { ttl: 600_000 },
    );
  });

  it('allows exactly one concurrent consumer and permanently rejects replay', async () => {
    const flow = await begin();
    const outcomes = await Promise.allSettled(
      Array.from({ length: 12 }, () => consumeOAuthState(flow.args)),
    );
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(11);
    await expect(consumeOAuthState(flow.args)).rejects.toMatchObject({ code: 'state' });
  });

  it('fails closed when acknowledgement of an atomic claim is lost', async () => {
    const flow = await begin();
    const claim = flow.adapter.setIfAbsent.getMockImplementation()!;
    flow.adapter.setIfAbsent.mockImplementationOnce(async (...args) => {
      await claim(...args);
      throw new Error('connection lost after commit');
    });
    await expect(consumeOAuthState(flow.args)).rejects.toMatchObject({ code: 'state' });
    await expect(consumeOAuthState(flow.args)).rejects.toMatchObject({ code: 'state' });
    expect(flow.values.get(`oauth:consumed:${flow.state}`)).toBe(true);
  });

  it('rejects ciphertext tampering before claiming state', async () => {
    const flow = await begin();
    const key = `oauth:state:${flow.state}`;
    const encrypted = flow.values.get(key) as string;
    flow.values.set(key, `${encrypted.slice(0, -2)}XX`);
    await expect(consumeOAuthState(flow.args)).rejects.toMatchObject({ code: 'state' });
    expect(flow.values.has(`oauth:consumed:${flow.state}`)).toBe(false);
  });

  it.each(['missing', 'different', 'duplicate'])(
    'rejects %s browser binding before claiming state',
    async (kind) => {
      const flow = await begin();
      const original = flow.req.headers.get('cookie')!;
      flow.req.headers.set(
        'cookie',
        kind === 'missing'
          ? ''
          : kind === 'duplicate'
            ? `${original}; ${original}`
            : `${original.split('=')[0]}=${'a'.repeat(43)}`,
      );
      await expect(consumeOAuthState(flow.args)).rejects.toMatchObject({ code: 'state' });
      expect(flow.values.has(`oauth:consumed:${flow.state}`)).toBe(false);
      flow.req.headers.set('cookie', original);
      await expect(consumeOAuthState(flow.args)).resolves.toHaveProperty('intent');
    },
  );

  it('accepts a cross-site callback without upstream authentication using the stored owner', async () => {
    const flow = await begin();
    flow.req.user = null;
    flow.req.headers.set('sec-fetch-site', 'cross-site');
    const { intent } = await consumeOAuthState(flow.args);
    expect(intent.owner).toEqual({ id: 'owner', collection: 'users' });
  });

  it('rejects conflicting authenticated owners without consuming', async () => {
    const flow = await begin();
    flow.req.user = { id: 'attacker', collection: 'users' } as never;
    await expect(consumeOAuthState(flow.args)).rejects.toMatchObject({ code: 'state' });
    expect(flow.values.has(`oauth:consumed:${flow.state}`)).toBe(false);
  });

  it('requires an authenticated owner at link start and keeps login ownerless', async () => {
    const fixture = setup();
    fixture.req.user = null;
    await expect(
      createOAuthState({ ...fixture, ...fixture.binding, returnTo: '/' }),
    ).rejects.toMatchObject({ code: 'state' });
    const started = await createOAuthState({
      ...fixture,
      ...fixture.binding,
      flow: 'login',
      collection: 'customers',
      returnTo: '/',
    });
    fixture.req.headers.set('cookie', started.setCookie.split(';')[0]!);
    const { intent } = await consumeOAuthState({
      ...fixture,
      ...fixture.binding,
      flow: 'login',
      collection: 'customers',
      state: started.state,
    });
    expect(intent.owner).toBeUndefined();
    expect([...fixture.values.keys()]).toEqual([
      `oauth:state:${started.state}`,
      `oauth:consumed:${started.state}`,
    ]);
  });

  it.each([
    { flow: 'login' },
    { collection: 'customers' },
    { callbackUrl: 'https://app.test/other' },
    { callbackUrl: 'https://other.test/api/connections/example/callback' },
  ])('rejects callback binding mismatch %j', async (change) => {
    const flow = await begin();
    await expect(consumeOAuthState({ ...flow.args, ...change } as never)).rejects.toMatchObject({
      code: 'state',
    });
    expect(flow.values.has(`oauth:consumed:${flow.state}`)).toBe(false);
  });

  it.each(['expiresAt', 'issuedAt', 'returnTo', 'piece', 'state', 'owner', 'verifier'])(
    'validates encrypted %s before claiming',
    async (field) => {
      const flow = await begin();
      const key = `oauth:state:${flow.state}`;
      const data = JSON.parse(await flow.encryption.decrypt(flow.values.get(key) as string));
      data[field] =
        field === 'expiresAt'
          ? 'Infinity'
          : field === 'issuedAt'
            ? null
            : field === 'returnTo'
              ? '/\\evil.test'
              : field === 'owner'
                ? undefined
                : 'wrong';
      flow.values.set(key, await flow.encryption.encrypt(JSON.stringify(data)));
      await expect(consumeOAuthState(flow.args)).rejects.toMatchObject({ code: 'state' });
      expect(flow.values.has(`oauth:consumed:${flow.state}`)).toBe(false);
    },
  );

  it.each([0, -1, 600_001, NaN, Infinity])(
    'rejects invalid lifetime %s even when KV retains state',
    async (duration) => {
      const flow = await begin();
      const key = `oauth:state:${flow.state}`;
      const data = JSON.parse(await flow.encryption.decrypt(flow.values.get(key) as string));
      data.expiresAt = data.issuedAt + duration;
      flow.values.set(key, await flow.encryption.encrypt(JSON.stringify(data)));
      await expect(consumeOAuthState(flow.args)).rejects.toMatchObject({ code: 'state' });
      expect(flow.values.has(`oauth:consumed:${flow.state}`)).toBe(false);
    },
  );

  it('rejects expiry at the exact deadline independently of KV cleanup', async () => {
    const flow = await begin();
    const data = JSON.parse(
      await flow.encryption.decrypt(flow.values.get(`oauth:state:${flow.state}`) as string),
    );
    flow.expirations.clear();
    vi.spyOn(Date, 'now').mockReturnValue(data.expiresAt);
    await expect(consumeOAuthState(flow.args)).rejects.toMatchObject({ code: 'state' });
  });

  it.each([
    '//evil.test/path',
    '/\\evil.test',
    '\\evil.test',
    'https://evil.test',
    'https://app.test//evil.test/path',
    '/a/..//evil.test',
    'javascript:alert(1)',
    ' https://app.test/',
    '/\n/evil.test',
  ])('rejects unsafe returnTo %s', async (returnTo) => {
    const fixture = setup();
    await expect(
      createOAuthState({ ...fixture, ...fixture.binding, returnTo }),
    ).rejects.toBeInstanceOf(Error);
    expect(fixture.values.size).toBe(0);
  });

  it('normalizes same-origin returnTo and protects reserved parameters in both recipe locations', async () => {
    const params = {
      state: 'evil',
      redirect_uri: 'https://evil.test',
      code_challenge: 'evil',
      code_challenge_method: 'plain',
      code_verifier: 'evil',
      client_id: 'evil',
      response_type: 'token',
      scope: 'admin',
      access_type: 'offline',
    };
    const fixture = setup({
      ...definition,
      oauth: {
        ...definition.oauth,
        authorizationUrl: `https://provider.test/authorize?${new URLSearchParams(params)}`,
        params,
      },
    });
    const started = await createOAuthState({
      ...fixture,
      ...fixture.binding,
      returnTo: 'https://app.test/settings',
    });
    const url = new URL(started.authorizationUrl);
    expect(url.searchParams.get('redirect_uri')).toBe(fixture.binding.callbackUrl);
    expect(url.searchParams.get('client_id')).toBe('client');
    expect(url.searchParams.get('state')).toBe(started.state);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('read');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.has('code_verifier')).toBe(false);
    expect(url.searchParams.get('access_type')).toBe('offline');
  });

  it('does not restore the replay claim after token exchange failure', async () => {
    const flow = await begin();
    const { intent } = await consumeOAuthState(flow.args);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'invalid_grant' }, { status: 400 })),
    );
    await expect(
      exchangeOAuthCode({
        piece: flow.piece,
        code: 'code',
        callbackUrl: intent.callbackUrl,
        verifier: intent.verifier,
      }),
    ).rejects.toMatchObject({ code: 'tokens' });
    await expect(consumeOAuthState(flow.args)).rejects.toMatchObject({ code: 'state' });
  });

  it('removes injected PKCE parameters when the recipe disables PKCE', async () => {
    const fixture = setup({
      ...definition,
      oauth: {
        ...definition.oauth,
        pkce: false,
        authorizationUrl:
          'https://provider.test/authorize?code_challenge=evil&code_challenge_method=plain',
        params: { code_challenge: 'evil', code_verifier: 'evil' },
      },
    });
    const flow = await begin(fixture);
    const params = new URL(flow.authorizationUrl).searchParams;
    expect(params.has('code_challenge')).toBe(false);
    expect(params.has('code_challenge_method')).toBe(false);
    expect(params.has('code_verifier')).toBe(false);
    expect((await consumeOAuthState(flow.args)).intent.verifier).toBeUndefined();
  });
});

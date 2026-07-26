import { describe, expect, it, vi } from 'vitest';

import type { FrogbotConfig, FrogbotRequest } from 'frogbot';
import { oauthPlugin } from '../index.js';
import type { OAuthProvider } from '../index.js';

function provider(): OAuthProvider {
  return {
    id: 'custom',
    service: 'custom-service',
    authorizationUrl: 'https://provider.test/authorize',
    tokenUrl: 'https://provider.test/token',
    scopes: ['profile'],
    authorize: ({ state, codeChallenge }) => new URL(`https://provider.test/authorize?state=${state}&code_challenge=${codeChallenge}`),
    exchange: vi.fn().mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' }),
    getAccount: vi.fn().mockResolvedValue({ id: 'account-1', email: 'user@example.com' }),
  };
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
    const base = { routeParams: { provider: 'custom' }, headers: new Headers(), searchParams: new URLSearchParams(), frogbot: {} };
    expect((await authorize.handler(base as unknown as FrogbotRequest)).status).toBe(401);
    const open = { ...base, user: { id: 'user-1' }, searchParams: new URLSearchParams({ returnUrl: 'https://evil.test' }) };
    expect((await authorize.handler(open as unknown as FrogbotRequest)).status).toBe(400);
    const rsc = { ...base, headers: new Headers({ RSC: '1' }) };
    expect((await authorize.handler(rsc as unknown as FrogbotRequest)).status).toBe(204);
  });

  it('persists state and completes the callback once with encrypted tokens', async () => {
    const currentProvider = provider();
    const list = await endpoints(currentProvider);
    const authorize = list.find((endpoint) => endpoint.path.endsWith('/authorize'))!;
    const callback = list.find((endpoint) => endpoint.method === 'get' && endpoint.path.endsWith('/callback'))!;
    const create = vi.fn().mockResolvedValueOnce({ id: 'state-1' }).mockResolvedValueOnce({ id: 'connection-1' });
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
    const deleteState = vi.fn().mockResolvedValueOnce({ docs: [stateDoc] }).mockResolvedValueOnce({ docs: [] });
    const callbackReq = {
      method: 'GET',
      routeParams: { provider: 'custom' },
      headers: new Headers(),
      searchParams: new URLSearchParams({ code: 'code', state: stateData.state }),
      frogbot: { delete: deleteState, find: vi.fn().mockResolvedValue({ docs: [] }), create },
    } as unknown as FrogbotRequest;
    const result = await callback.handler(callbackReq);
    expect(result.headers.get('location')).toBe('https://app.test/settings?oauth_connection=connection-1');
    expect(create.mock.calls[1][0].data).toMatchObject({ services: ['custom-service'], source: 'oauth', sourceKey: 'custom', credentialType: 'oauth2', accountId: 'account-1' });
    expect(create.mock.calls[1][0].data.encryptedCredentials).not.toContain('access');
    expect(callbackReq.frogbot.find).toHaveBeenCalledWith(expect.objectContaining({ where: { and: [
      { owner: { equals: 'user-1' } },
      { sourceKey: { equals: 'custom' } },
      { accountId: { equals: 'account-1' } },
    ] } }));
    expect((currentProvider.exchange as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(expect.objectContaining({ codeVerifier: stateData.codeVerifier }));
    expect((await callback.handler(callbackReq)).status).toBe(400);
  });

  it('normalizes cancellation and provider failures', async () => {
    const currentProvider = provider();
    (currentProvider.exchange as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('secret provider body'));
    const callback = (await endpoints(currentProvider)).find((endpoint) => endpoint.method === 'get' && endpoint.path.endsWith('/callback'))!;
    const state = { id: 'state', provider: 'custom', owner: 'user', returnUrl: 'https://app.test/', codeVerifier: 'verifier', expiresAt: new Date(Date.now() + 10000).toISOString() };
    const request = (query: Record<string, string>) => ({
      method: 'GET', routeParams: { provider: 'custom' }, headers: new Headers(), searchParams: new URLSearchParams(query),
      frogbot: { delete: vi.fn().mockResolvedValue({ docs: [state] }) },
    }) as unknown as FrogbotRequest;
    const cancelled = await callback.handler(request({ state: 'state', error: 'access_denied' }));
    expect(cancelled.headers.get('location')).toContain('oauth_error=access_denied');
    const failed = await callback.handler(request({ state: 'state', code: 'code' }));
    expect(failed.headers.get('location')).toContain('oauth_error=provider_error');
    expect(failed.headers.get('location')).not.toContain('secret');
  });
});

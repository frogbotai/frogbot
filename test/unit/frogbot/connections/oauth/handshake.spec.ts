import { expect, it } from 'vitest';

import {
  consumeOAuthState,
  createOAuthState,
  exchangeOAuthCode,
  lookupOAuthAccount,
} from '../../../../../packages/frogbot/src/connections/oauth/index.js';
import { refreshOAuthTokens } from '../../../../../packages/frogbot/src/connections/oauth/tokens.js';
import {
  pkceChallenge,
  startStubOAuthProvider,
  stubOAuthAccount,
  stubOAuthTokens,
} from '../../../../__helpers/shared/StubOAuthProvider.js';
import { definition, setup } from './fixtures.js';

it('completes a real provider redirect, PKCE exchange, userinfo lookup and refresh', async () => {
  const provider = await startStubOAuthProvider();
  try {
    const fixture = setup({
      ...definition,
      oauth: {
        ...definition.oauth,
        authorizationUrl: `${provider.url}/authorize`,
        tokenUrl: `${provider.url}/token`,
        scopes: ['profile'],
        account: async ({ tokens }) => {
          const response = await fetch(`${provider.url}/userinfo`, {
            headers: { authorization: `Bearer ${tokens.access_token}` },
          });
          const account = await response.json();
          return { id: account.id, label: account.name, email: account.email };
        },
      },
    });
    const started = await createOAuthState({
      ...fixture.binding,
      kv: fixture.kv,
      encryption: fixture.encryption,
      req: fixture.req,
      returnTo: '/settings/connections',
    });
    const redirect = await fetch(started.authorizationUrl, { redirect: 'manual' });
    expect(redirect.status).toBe(302);
    const callback = new URL(redirect.headers.get('location')!);
    fixture.req.headers.set('cookie', started.setCookie.split(';')[0]!);
    const consume = () =>
      consumeOAuthState({
        ...fixture.binding,
        kv: fixture.kv,
        encryption: fixture.encryption,
        req: fixture.req,
        state: callback.searchParams.get('state')!,
      });
    const { intent } = await consume();
    const tokens = await exchangeOAuthCode({
      piece: fixture.piece,
      code: callback.searchParams.get('code')!,
      callbackUrl: fixture.binding.callbackUrl,
      verifier: intent.verifier,
    });
    expect(provider.requests.token[0]).toMatchObject({
      client_id: 'client',
      client_secret: 'secret',
      redirect_uri: fixture.binding.callbackUrl,
    });
    expect(pkceChallenge(provider.requests.token[0]!.code_verifier!)).toBe(
      provider.requests.authorize[0]!.get('code_challenge'),
    );
    await expect(
      lookupOAuthAccount({ piece: fixture.piece, tokens, req: fixture.req }),
    ).resolves.toEqual({
      id: stubOAuthAccount.id,
      label: stubOAuthAccount.name,
      email: stubOAuthAccount.email,
    });
    expect(provider.requests.account).toEqual([`Bearer ${stubOAuthTokens.access}`]);
    await expect(consume()).rejects.toMatchObject({ code: 'state' });
    await expect(
      refreshOAuthTokens({ piece: fixture.piece, tokens, req: fixture.req }),
    ).resolves.toMatchObject({
      access_token: stubOAuthTokens.refreshed,
      refresh_token: stubOAuthTokens.refresh,
    });
    expect(provider.requests.token[1]).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: stubOAuthTokens.refresh,
    });
  } finally {
    await provider.close();
  }
});

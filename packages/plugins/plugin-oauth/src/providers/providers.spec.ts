import { describe, expect, it, vi } from 'vitest';

import type { OAuthProvider } from '../index.js';
import { dropboxProvider, githubProvider, googleProvider, microsoftProvider, notionProvider, slackProvider, stripeProvider, xeroProvider, zoomProvider } from '../index.js';

function jwt(value: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(value)).toString('base64url')}.signature`;
}

const cases: { name: string; create: (request: typeof fetch) => OAuthProvider; account: Record<string, unknown>; id: string }[] = [
  { name: 'google', create: (request) => googleProvider({ clientId: 'id', clientSecret: 'secret', fetch: request }), account: { sub: 'google-1', email: 'google@test' }, id: 'google-1' },
  { name: 'microsoft', create: (request) => microsoftProvider({ clientId: 'id', clientSecret: 'secret', fetch: request }), account: { id: 'microsoft-1', mail: 'microsoft@test' }, id: 'microsoft-1' },
  { name: 'zoom', create: (request) => zoomProvider({ clientId: 'id', clientSecret: 'secret', fetch: request }), account: { id: 'zoom-1', email: 'zoom@test' }, id: 'zoom-1' },
  { name: 'stripe', create: (request) => stripeProvider({ clientId: 'id', clientSecret: 'secret', fetch: request }), account: { id: 'stripe-1', email: 'stripe@test' }, id: 'acct_1' },
  { name: 'github', create: (request) => githubProvider({ clientId: 'id', clientSecret: 'secret', fetch: request }), account: { id: 'github-1', login: 'frog' }, id: 'github-1' },
  { name: 'notion', create: (request) => notionProvider({ clientId: 'id', clientSecret: 'secret', fetch: request }), account: { id: 'notion-1', name: 'Frog' }, id: 'notion-1' },
  { name: 'dropbox', create: (request) => dropboxProvider({ clientId: 'id', clientSecret: 'secret', fetch: request }), account: { account_id: 'dropbox-1', email: 'dropbox@test' }, id: 'dropbox-1' },
  { name: 'slack', create: (request) => slackProvider({ clientId: 'id', clientSecret: 'secret', fetch: request }), account: { team_id: 'slack-1', team: 'Frog' }, id: 'slack-1' },
];

describe.each(cases)('$name provider', ({ create, account, id }) => {
  it('implements authorize, exchange, account, refresh, and revocation contracts', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access', refresh_token: 'refresh', stripe_user_id: 'acct_1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(account), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'next' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 })) as unknown as typeof fetch;
    const provider = create(request);
    const authorize = await provider.authorize({ callbackUrl: 'https://app.test/callback', codeChallenge: 'challenge', state: 'state' });
    expect(authorize.searchParams.get('state')).toBe('state');
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    const tokens = await provider.exchange({ callbackUrl: 'https://app.test/callback', code: 'code', codeVerifier: 'verifier', req: {} as never });
    expect(tokens.accessToken).toBe('access');
    expect((await provider.getAccount({ tokens, req: {} as never })).id).toBe(id);
    expect((await provider.refresh!({ tokens, req: {} as never })).accessToken).toBe('next');
    if (provider.revoke) await provider.revoke({ tokens, req: {} as never });
  });
});

describe('google provider service', () => {
  it('can claim a Google piece service', () => {
    const provider = googleProvider({ clientId: 'id', clientSecret: 'secret', service: 'google-sheets' });
    expect(provider).toMatchObject({ id: 'google-sheets', service: 'google-sheets' });
  });
});

describe('xero provider', () => {
  it('uses Basic auth and normalizes JWT account data', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: jwt({ xero_userid: 'xero-1' }), id_token: jwt({ email: 'xero@test' }), refresh_token: 'refresh' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'next' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 })) as unknown as typeof fetch;
    const provider = xeroProvider({ clientId: 'id', clientSecret: 'secret', fetch: request });
    const tokens = await provider.exchange({ callbackUrl: 'https://app.test/callback', code: 'code', codeVerifier: 'verifier', req: {} as never });
    expect((await provider.getAccount({ tokens, req: {} as never }))).toMatchObject({ id: 'xero-1', email: 'xero@test' });
    expect((request as ReturnType<typeof vi.fn>).mock.calls[0][1].headers.Authorization).toMatch(/^Basic /);
    await provider.refresh!({ tokens, req: {} as never });
    await provider.revoke!({ tokens, req: {} as never });
  });
});

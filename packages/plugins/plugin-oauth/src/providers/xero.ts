import type { OAuthProvider } from '../types.js';
import { authorizationUrl, basicCredentials, type OAuthProviderOptions, tokenRequest } from './shared.js';

function decodeJWT(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  const payload = value.split('.')[1];
  if (!payload) return {};
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

export function xeroProvider(options: OAuthProviderOptions): OAuthProvider {
  const request = options.fetch ?? fetch;
  const scopes = options.scopes ?? ['openid', 'profile', 'email', 'offline_access', 'accounting.transactions'];
  const headers = { Authorization: basicCredentials(options.clientId, options.clientSecret) };
  return {
    id: 'xero', authorizationUrl: 'https://login.xero.com/identity/connect/authorize', tokenUrl: 'https://identity.xero.com/connect/token', scopes,
    authorize: (context) => authorizationUrl({ url: 'https://login.xero.com/identity/connect/authorize', clientId: options.clientId, scopes, context }),
    exchange: async ({ code, callbackUrl, codeVerifier }) => (await tokenRequest({ fetch: request, url: 'https://identity.xero.com/connect/token', headers, body: { grant_type: 'authorization_code', code, redirect_uri: callbackUrl, code_verifier: codeVerifier } })).tokens,
    getAccount: ({ tokens }) => {
      const access = decodeJWT(tokens.accessToken);
      const identity = decodeJWT(tokens.idToken);
      return Promise.resolve({ id: String(access.xero_userid ?? identity.sub), email: typeof identity.email === 'string' ? identity.email : undefined, name: typeof identity.name === 'string' ? identity.name : undefined, metadata: { access, identity } });
    },
    refresh: async ({ tokens }) => (await tokenRequest({ fetch: request, url: 'https://identity.xero.com/connect/token', headers, body: { grant_type: 'refresh_token', refresh_token: tokens.refreshToken } })).tokens,
    revoke: async ({ tokens }) => {
      const body = new URLSearchParams({ token: tokens.refreshToken ?? tokens.accessToken });
      const response = await request('https://identity.xero.com/connect/revocation', { method: 'POST', headers, body });
      if (!response.ok) throw new Error('OAuth revocation failed.');
    },
  };
}

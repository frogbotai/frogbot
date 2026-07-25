import type { OAuthProvider } from '../types.js';
import { authorizationUrl, jsonRequest, type OAuthProviderOptions, tokenRequest } from './shared.js';

export function googleProvider(options: OAuthProviderOptions): OAuthProvider {
  const request = options.fetch ?? fetch;
  const scopes = options.scopes ?? ['openid', 'email', 'profile'];
  return {
    id: 'google', authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', scopes,
    authorize: (context) => authorizationUrl({ url: 'https://accounts.google.com/o/oauth2/v2/auth', clientId: options.clientId, scopes, context, params: { access_type: 'offline', include_granted_scopes: 'true', prompt: 'consent select_account' } }),
    exchange: async ({ code, callbackUrl, codeVerifier }) => (await tokenRequest({ fetch: request, url: 'https://oauth2.googleapis.com/token', body: { grant_type: 'authorization_code', code, redirect_uri: callbackUrl, code_verifier: codeVerifier, client_id: options.clientId, client_secret: options.clientSecret } })).tokens,
    getAccount: async ({ tokens }) => {
      const value = await jsonRequest({ fetch: request, url: 'https://www.googleapis.com/oauth2/v3/userinfo', accessToken: tokens.accessToken });
      return { id: String(value.sub), email: typeof value.email === 'string' ? value.email : undefined, name: typeof value.name === 'string' ? value.name : undefined, metadata: value };
    },
    refresh: async ({ tokens }) => (await tokenRequest({ fetch: request, url: 'https://oauth2.googleapis.com/token', body: { grant_type: 'refresh_token', refresh_token: tokens.refreshToken, client_id: options.clientId, client_secret: options.clientSecret } })).tokens,
    revoke: async ({ tokens }) => {
      const response = await request(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.refreshToken ?? tokens.accessToken)}`, { method: 'POST' });
      if (!response.ok) throw new Error('OAuth revocation failed.');
    },
  };
}

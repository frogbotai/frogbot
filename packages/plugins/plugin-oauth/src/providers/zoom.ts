import type { OAuthProvider } from '../types.js';
import { authorizationUrl, basicCredentials, jsonRequest, type OAuthProviderOptions, tokenRequest } from './shared.js';

export function zoomProvider(options: OAuthProviderOptions): OAuthProvider {
  const request = options.fetch ?? fetch;
  const scopes = options.scopes ?? [];
  const headers = { Authorization: basicCredentials(options.clientId, options.clientSecret) };
  return {
    id: 'zoom', service: 'zoom', authorizationUrl: 'https://zoom.us/oauth/authorize', tokenUrl: 'https://zoom.us/oauth/token', scopes,
    authorize: (context) => authorizationUrl({ url: 'https://zoom.us/oauth/authorize', clientId: options.clientId, scopes, context }),
    exchange: async ({ code, callbackUrl, codeVerifier }) => (await tokenRequest({ fetch: request, url: 'https://zoom.us/oauth/token', headers, body: { grant_type: 'authorization_code', code, redirect_uri: callbackUrl, code_verifier: codeVerifier } })).tokens,
    getAccount: async ({ tokens }) => {
      const value = await jsonRequest({ fetch: request, url: 'https://api.zoom.us/v2/users/me', accessToken: tokens.accessToken });
      return { id: String(value.id), email: typeof value.email === 'string' ? value.email : undefined, name: typeof value.display_name === 'string' ? value.display_name : undefined, metadata: value };
    },
    refresh: async ({ tokens }) => (await tokenRequest({ fetch: request, url: 'https://zoom.us/oauth/token', headers, body: { grant_type: 'refresh_token', refresh_token: tokens.refreshToken } })).tokens,
    revoke: async ({ tokens }) => {
      const body = new URLSearchParams({ token: tokens.accessToken });
      const response = await request('https://zoom.us/oauth/revoke', { method: 'POST', headers, body });
      if (!response.ok) throw new Error('OAuth revocation failed.');
    },
  };
}

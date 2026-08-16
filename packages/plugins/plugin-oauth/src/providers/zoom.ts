import type { OAuthProvider } from '../types.js';
import {
  authorizationUrl,
  basicCredentials,
  jsonRequest,
  type OAuthProviderOptions,
  tokenRequest,
} from './shared.js';

const AUTHORIZATION_URL = 'https://zoom.us/oauth/authorize';
const TOKEN_URL = 'https://zoom.us/oauth/token';
const REVOKE_URL = 'https://zoom.us/oauth/revoke';
const USERS_ME_URL = 'https://api.zoom.us/v2/users/me';

export function zoomProvider(options: OAuthProviderOptions): OAuthProvider {
  const request = options.fetch ?? fetch;
  const scopes = options.scopes ?? [];
  const headers = { Authorization: basicCredentials(options.clientId, options.clientSecret) };
  return {
    id: 'zoom',
    service: 'zoom',
    label: 'Zoom',
    signIn: options.signIn,
    authorizationUrl: AUTHORIZATION_URL,
    tokenUrl: TOKEN_URL,
    scopes,
    authorize: (context) =>
      authorizationUrl({
        url: AUTHORIZATION_URL,
        clientId: options.clientId,
        scopes,
        context,
      }),
    exchange: async ({ code, callbackUrl, codeVerifier }) =>
      (
        await tokenRequest({
          fetch: request,
          url: TOKEN_URL,
          headers,
          body: {
            grant_type: 'authorization_code',
            code,
            redirect_uri: callbackUrl,
            code_verifier: codeVerifier,
          },
        })
      ).tokens,
    getAccount: async ({ tokens }) => {
      const value = await jsonRequest({
        fetch: request,
        url: USERS_ME_URL,
        accessToken: tokens.accessToken,
      });
      return {
        id: String(value.id),
        email: typeof value.email === 'string' ? value.email : undefined,
        name: typeof value.display_name === 'string' ? value.display_name : undefined,
        metadata: value,
      };
    },
    refresh: async ({ tokens }) =>
      (
        await tokenRequest({
          fetch: request,
          url: TOKEN_URL,
          headers,
          body: { grant_type: 'refresh_token', refresh_token: tokens.refreshToken },
        })
      ).tokens,
    revoke: async ({ tokens }) => {
      const body = new URLSearchParams({ token: tokens.accessToken });
      const response = await request(REVOKE_URL, { method: 'POST', headers, body });
      if (!response.ok) throw new Error('OAuth revocation failed.');
    },
  };
}

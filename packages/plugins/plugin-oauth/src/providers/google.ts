import type { OAuthProvider } from '../types.js';
import {
  authorizationUrl,
  jsonRequest,
  type OAuthProviderOptions,
  tokenRequest,
} from './shared.js';

const AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export function googleProvider(options: OAuthProviderOptions): OAuthProvider {
  const request = options.fetch ?? fetch;
  const scopes = options.scopes ?? ['openid', 'email', 'profile'];
  const service = options.service ?? 'google';
  return {
    id: service,
    service,
    label: 'Google',
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
        params: {
          access_type: 'offline',
          include_granted_scopes: 'true',
          prompt: 'consent select_account',
        },
      }),
    exchange: async ({ code, callbackUrl, codeVerifier }) =>
      (
        await tokenRequest({
          fetch: request,
          url: TOKEN_URL,
          body: {
            grant_type: 'authorization_code',
            code,
            redirect_uri: callbackUrl,
            code_verifier: codeVerifier,
            client_id: options.clientId,
            client_secret: options.clientSecret,
          },
        })
      ).tokens,
    getAccount: async ({ tokens }) => {
      const value = await jsonRequest({
        fetch: request,
        url: USERINFO_URL,
        accessToken: tokens.accessToken,
      });
      return {
        id: String(value.sub),
        email: typeof value.email === 'string' ? value.email : undefined,
        name: typeof value.name === 'string' ? value.name : undefined,
        metadata: value,
      };
    },
    refresh: async ({ tokens }) =>
      (
        await tokenRequest({
          fetch: request,
          url: TOKEN_URL,
          body: {
            grant_type: 'refresh_token',
            refresh_token: tokens.refreshToken,
            client_id: options.clientId,
            client_secret: options.clientSecret,
          },
        })
      ).tokens,
    revoke: async ({ tokens }) => {
      const token = tokens.refreshToken ?? tokens.accessToken;
      const response = await request(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('OAuth revocation failed.');
    },
  };
}

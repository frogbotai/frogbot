import type { OAuthProvider } from '../types.js';
import {
  authorizationUrl,
  basicCredentials,
  type OAuthProviderOptions,
  tokenRequest,
} from './shared.js';

const AUTHORIZATION_URL = 'https://login.xero.com/identity/connect/authorize';
const TOKEN_URL = 'https://identity.xero.com/connect/token';
const REVOKE_URL = 'https://identity.xero.com/connect/revocation';

function decodeJWT(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  const payload = value.split('.')[1];
  if (!payload) return {};
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

export function xeroProvider(options: OAuthProviderOptions): OAuthProvider {
  const request = options.fetch ?? fetch;
  const scopes = options.scopes ?? [
    'openid',
    'profile',
    'email',
    'offline_access',
    'accounting.transactions',
  ];
  const headers = { Authorization: basicCredentials(options.clientId, options.clientSecret) };
  return {
    id: 'xero',
    service: 'xero',
    label: 'Xero',
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
    getAccount: ({ tokens }) => {
      const access = decodeJWT(tokens.accessToken);
      const identity = decodeJWT(tokens.idToken);
      return Promise.resolve({
        id: String(access.xero_userid ?? identity.sub),
        email: typeof identity.email === 'string' ? identity.email : undefined,
        name: typeof identity.name === 'string' ? identity.name : undefined,
        metadata: { access, identity },
      });
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
      const body = new URLSearchParams({ token: tokens.refreshToken ?? tokens.accessToken });
      const response = await request(REVOKE_URL, { method: 'POST', headers, body });
      if (!response.ok) throw new Error('OAuth revocation failed.');
    },
  };
}

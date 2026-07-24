import type { OAuthProvider } from '../types.js';
import { authorizationUrl, jsonRequest, type OAuthProviderOptions, tokenRequest } from './shared.js';

export type MicrosoftProviderOptions = OAuthProviderOptions & { tenant?: string };

export function microsoftProvider(options: MicrosoftProviderOptions): OAuthProvider {
  const request = options.fetch ?? fetch;
  const tenant = options.tenant ?? 'common';
  const authorization = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
  const token = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  const scopes = options.scopes ?? ['openid', 'email', 'profile', 'offline_access'];
  return {
    id: 'microsoft', authorizationUrl: authorization, tokenUrl: token, scopes,
    authorize: (context) => authorizationUrl({ url: authorization, clientId: options.clientId, scopes, context, params: { prompt: 'select_account' } }),
    exchange: async ({ code, callbackUrl, codeVerifier }) => (await tokenRequest({ fetch: request, url: token, body: { grant_type: 'authorization_code', code, redirect_uri: callbackUrl, code_verifier: codeVerifier, client_id: options.clientId, client_secret: options.clientSecret } })).tokens,
    getAccount: async ({ tokens }) => {
      const value = await jsonRequest({ fetch: request, url: 'https://graph.microsoft.com/v1.0/me', accessToken: tokens.accessToken });
      return { id: String(value.id), email: typeof value.mail === 'string' ? value.mail : typeof value.userPrincipalName === 'string' ? value.userPrincipalName : undefined, name: typeof value.displayName === 'string' ? value.displayName : undefined, metadata: value };
    },
    refresh: async ({ tokens }) => (await tokenRequest({ fetch: request, url: token, body: { grant_type: 'refresh_token', refresh_token: tokens.refreshToken, client_id: options.clientId, client_secret: options.clientSecret } })).tokens,
  };
}

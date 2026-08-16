import type { OAuthProvider } from '../types.js';
import { authorizationUrl, jsonRequest, type OAuthProviderOptions, tokenRequest } from './shared.js';

const GRAPH_ME_URL = 'https://graph.microsoft.com/v1.0/me';

export type MicrosoftProviderOptions = OAuthProviderOptions & { tenant?: string };

export function microsoftProvider(options: MicrosoftProviderOptions): OAuthProvider {
  const request = options.fetch ?? fetch;
  const tenant = options.tenant ?? 'common';
  const authorization = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
  const token = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  const scopes = options.scopes ?? ['openid', 'email', 'profile', 'offline_access'];
  const service = options.service ?? 'microsoft';
  return {
    id: service,
    service,
    label: 'Microsoft',
    signIn: options.signIn,
    authorizationUrl: authorization,
    tokenUrl: token,
    scopes,
    authorize: (context) =>
      authorizationUrl({
        url: authorization,
        clientId: options.clientId,
        scopes,
        context,
        params: { prompt: 'select_account' },
      }),
    exchange: async ({ code, callbackUrl, codeVerifier }) =>
      (
        await tokenRequest({
          fetch: request,
          url: token,
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
        url: GRAPH_ME_URL,
        accessToken: tokens.accessToken,
      });
      const mail = typeof value.mail === 'string' ? value.mail : undefined;
      const principal =
        typeof value.userPrincipalName === 'string' ? value.userPrincipalName : undefined;
      return {
        id: String(value.id),
        email: mail ?? principal,
        name: typeof value.displayName === 'string' ? value.displayName : undefined,
        metadata: value,
      };
    },
    refresh: async ({ tokens }) =>
      (
        await tokenRequest({
          fetch: request,
          url: token,
          body: {
            grant_type: 'refresh_token',
            refresh_token: tokens.refreshToken,
            client_id: options.clientId,
            client_secret: options.clientSecret,
          },
        })
      ).tokens,
  };
}

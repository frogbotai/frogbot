import type { OAuthProvider, OAuthTokenSet } from '../types.js';
import { authorizationUrl, jsonRequest, type OAuthProviderOptions, tokenRequest } from './shared.js';

const AUTHORIZATION_URL = 'https://connect.stripe.com/oauth/authorize';
const TOKEN_URL = 'https://connect.stripe.com/oauth/token';
const DEAUTHORIZE_URL = 'https://connect.stripe.com/oauth/deauthorize';
const ACCOUNTS_URL = 'https://api.stripe.com/v1/accounts';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value ? (value as Record<string, unknown>) : {};
}

export function stripeProvider(options: OAuthProviderOptions): OAuthProvider {
  const request = options.fetch ?? fetch;
  const scopes = options.scopes ?? ['read_write'];
  const headers = { Authorization: `Bearer ${options.clientSecret}` };
  const token = async (body: Record<string, string | undefined>): Promise<OAuthTokenSet> => {
    const result = await tokenRequest({ fetch: request, url: TOKEN_URL, headers, body });
    return { ...result.tokens, metadata: { stripeAccountId: result.value.stripe_user_id } };
  };
  return {
    id: 'stripe',
    service: 'stripe',
    label: 'Stripe',
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
    exchange: ({ code }) => token({ grant_type: 'authorization_code', code }),
    getAccount: async ({ tokens }) => {
      const id = String(tokens.metadata?.stripeAccountId);
      const value = await jsonRequest({
        fetch: request,
        url: `${ACCOUNTS_URL}/${encodeURIComponent(id)}`,
        accessToken: options.clientSecret,
      });
      const dashboard = asRecord(asRecord(value.settings).dashboard);
      return {
        id,
        email: typeof value.email === 'string' ? value.email : undefined,
        name: typeof dashboard.display_name === 'string' ? dashboard.display_name : undefined,
        metadata: value,
      };
    },
    refresh: ({ tokens }) => token({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken }),
    revoke: async ({ tokens }) => {
      const body = new URLSearchParams({
        client_id: options.clientId,
        stripe_user_id: String(tokens.metadata?.stripeAccountId),
      });
      const response = await request(DEAUTHORIZE_URL, { method: 'POST', headers, body });
      if (!response.ok) throw new Error('OAuth revocation failed.');
    },
  };
}

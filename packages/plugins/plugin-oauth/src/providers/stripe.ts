import type { OAuthProvider, OAuthTokenSet } from '../types.js';
import { authorizationUrl, jsonRequest, type OAuthProviderOptions, tokenRequest } from './shared.js';

export function stripeProvider(options: OAuthProviderOptions): OAuthProvider {
  const request = options.fetch ?? fetch;
  const scopes = options.scopes ?? ['read_write'];
  const token = async (body: Record<string, string | undefined>): Promise<OAuthTokenSet> => {
    const result = await tokenRequest({ fetch: request, url: 'https://connect.stripe.com/oauth/token', headers: { Authorization: `Bearer ${options.clientSecret}` }, body });
    return { ...result.tokens, metadata: { stripeAccountId: result.value.stripe_user_id } };
  };
  return {
    id: 'stripe', authorizationUrl: 'https://connect.stripe.com/oauth/authorize', tokenUrl: 'https://connect.stripe.com/oauth/token', scopes,
    authorize: (context) => authorizationUrl({ url: 'https://connect.stripe.com/oauth/authorize', clientId: options.clientId, scopes, context }),
    exchange: ({ code }) => token({ grant_type: 'authorization_code', code }),
    getAccount: async ({ tokens }) => {
      const id = String(tokens.metadata?.stripeAccountId);
      const value = await jsonRequest({ fetch: request, url: `https://api.stripe.com/v1/accounts/${encodeURIComponent(id)}`, accessToken: options.clientSecret });
      const email = typeof value.email === 'string' ? value.email : undefined;
      const settings = typeof value.settings === 'object' && value.settings ? value.settings as Record<string, unknown> : {};
      const dashboard = typeof settings.dashboard === 'object' && settings.dashboard ? settings.dashboard as Record<string, unknown> : {};
      return { id, email, name: typeof dashboard.display_name === 'string' ? dashboard.display_name : undefined, metadata: value };
    },
    refresh: ({ tokens }) => token({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken }),
    revoke: async ({ tokens }) => {
      const body = new URLSearchParams({ client_id: options.clientId, stripe_user_id: String(tokens.metadata?.stripeAccountId) });
      const response = await request('https://connect.stripe.com/oauth/deauthorize', { method: 'POST', headers: { Authorization: `Bearer ${options.clientSecret}` }, body });
      if (!response.ok) throw new Error('OAuth revocation failed.');
    },
  };
}

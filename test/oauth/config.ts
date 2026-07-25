import { oauthPlugin } from '@frogbotai/plugin-oauth';
import type { OAuthProvider } from '@frogbotai/plugin-oauth';
import type { FrogbotConfig, Plugin } from 'frogbot';

export const provider: OAuthProvider = {
  id: 'custom',
  service: 'custom-service',
  authorizationUrl: 'https://provider.test/authorize',
  tokenUrl: 'https://provider.test/token',
  scopes: ['profile'],
  authorize: ({ codeChallenge, state }) => new URL(`https://provider.test/authorize?state=${state}&code_challenge=${codeChallenge}`),
  exchange: async () => ({ accessToken: 'access', refreshToken: 'refresh' }),
  getAccount: async () => ({ id: 'account-1', email: 'user@example.com' }),
  refresh: async () => ({ accessToken: 'next' }),
  revoke: async () => undefined,
};

export const addTenant: Plugin = (config) => ({
  ...config,
  collections: config.collections.map((collection) => collection.slug === 'connections'
    ? { ...collection, fields: [...collection.fields, { name: 'tenantMarker', type: 'text' as const }] }
    : collection),
});

export const config: FrogbotConfig = {
  secret: 'oauth-test',
  serverURL: 'https://app.test',
  db: {} as FrogbotConfig['db'],
  collections: [
    { slug: 'accounts', auth: true, fields: [] },
    { slug: 'connections', connections: true, fields: [{ name: 'environment', type: 'text' }] },
  ],
  plugins: [
    oauthPlugin({
      providers: [provider],
      authCollection: 'accounts',
      statesSlug: 'states',
    }),
    addTenant,
  ],
};

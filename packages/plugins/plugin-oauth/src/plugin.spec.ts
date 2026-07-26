import { describe, expect, expectTypeOf, it } from 'vitest';

import type { FrogbotConfig, Plugin } from 'frogbot';
import { oauthPlugin } from './index.js';
import type { OAuthProvider } from './index.js';

const provider: OAuthProvider = {
  id: 'custom',
  service: 'custom-service',
  authorizationUrl: 'https://provider.test/authorize',
  tokenUrl: 'https://provider.test/token',
  scopes: ['profile'],
  authorize: ({ callbackUrl, codeChallenge, state }) => {
    const url = new URL('https://provider.test/authorize');
    url.search = new URLSearchParams({ callbackUrl, codeChallenge, state }).toString();
    return url;
  },
  exchange: async () => ({ accessToken: 'token' }),
  getAccount: async () => ({ id: 'account' }),
};

describe('oauthPlugin', () => {
  it('provides a Frogbot plugin for custom provider objects', async () => {
    const plugin = oauthPlugin({ providers: [provider] });
    expectTypeOf(plugin).toMatchTypeOf<Plugin>();
    const config = {
      secret: 'test',
      db: {},
      collections: [{ slug: 'users', auth: true, fields: [] }],
    } as FrogbotConfig;
    const result = await plugin(config);
    expect(result.collections.map((collection) => collection.slug)).toEqual([
      'users',
      'oauth-states',
    ]);
    expect(result.credentialSources).toEqual([expect.objectContaining({ key: 'custom', services: ['custom-service'], credentialTypes: ['oauth2'] })]);
  });

  it('rejects duplicate and empty provider IDs', () => {
    expect(() => oauthPlugin({ providers: [provider, provider] })).toThrow("Provider ID 'custom' must be unique");
    expect(() => oauthPlugin({ providers: [{ ...provider, id: '' }] })).toThrow('Provider IDs must not be empty');
    expect(() => oauthPlugin({ providers: [{ ...provider, service: '' }] })).toThrow('Provider service IDs must not be empty');
  });

  it('groups pieces sharing OAuth credentials and unions scopes', async () => {
    const auth = { clientId: 'id', clientSecret: 'secret' };
    const piece = (service: string, scopes: string[]) => ({
      service,
      credentialType: 'oauth2' as const,
      policy: { type: 'oauth' as const, ...auth, source: auth },
      actions: [],
      tool: () => { throw new Error('unused'); },
      tools: () => [],
      scopes,
    });
    const plugin = oauthPlugin();
    const result = await plugin({
      secret: 'test', db: {}, collections: [{ slug: 'users', auth: true, fields: [] }],
      pieces: [piece('google_sheets', ['sheets']), piece('google_drive', ['drive'])],
    } as FrogbotConfig);
    expect(result.credentialSources).toEqual([expect.objectContaining({ key: 'google', services: ['google_sheets', 'google_drive'], scopes: ['sheets', 'drive'] })]);
  });
});

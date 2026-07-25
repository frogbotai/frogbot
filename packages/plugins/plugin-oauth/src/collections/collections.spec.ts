import { describe, expect, it } from 'vitest';

import type { FrogbotConfig, FrogbotRequest } from 'frogbot';
import { oauthPlugin } from '../index.js';
import type { OAuthProvider } from '../index.js';

const provider: OAuthProvider = {
  id: 'custom',
  service: 'custom-service',
  authorizationUrl: 'https://provider.test/authorize',
  tokenUrl: 'https://provider.test/token',
  scopes: [],
  authorize: () => new URL('https://provider.test/authorize'),
  exchange: async () => ({ accessToken: 'token' }),
  getAccount: async () => ({ id: 'account' }),
};

function config(): FrogbotConfig {
  return { secret: 'test', db: {} as FrogbotConfig['db'], collections: [{ slug: 'users', auth: true, fields: [] }] };
}

describe('OAuth collections', () => {
  it('keeps states server-only and does not inject a connections collection', async () => {
    const result = await oauthPlugin({ providers: [provider] })(config());
    const states = result.collections.find((collection) => collection.slug === 'oauth-states')!;
    expect(await states.access?.read?.({ req: {} as FrogbotRequest })).toBe(false);
    expect(result.collections.some((collection) => collection.slug === 'oauth-connections')).toBe(false);
  });

  it('merges transformed state collections and custom owner fields', async () => {
    const input = config();
    input.collections.push({
      slug: 'oauth-states',
      fields: [{ name: 'tenantMarker', type: 'text' }],
      endpoints: [{ method: 'get', path: '/tenant', handler: () => Response.json({}) }],
    });
    const result = await oauthPlugin({
      providers: [provider],
      ownerField: { name: 'tenant', relationTo: 'users' },
      statesCollection: { fields: [{ name: 'custom', type: 'json' }] },
    })(input);
    const states = result.collections.find((collection) => collection.slug === 'oauth-states')!;
    const names = states.fields.map((field) => ('name' in field ? field.name : null));
    expect(names).toEqual(expect.arrayContaining(['tenant', 'tenantMarker', 'custom']));
    expect(states.endpoints?.map((endpoint) => endpoint.path)).toContain('/tenant');
  });
});

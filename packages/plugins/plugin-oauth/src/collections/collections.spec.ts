import { describe, expect, it } from 'vitest';

import type { FrogbotConfig, FrogbotRequest } from 'frogbot';
import { oauthPlugin } from '../index.js';
import type { OAuthProvider } from '../index.js';

const provider: OAuthProvider = {
  id: 'custom',
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
  it('keeps states server-only and connections owner-scoped', async () => {
    const result = await oauthPlugin({ providers: [provider] })(config());
    const states = result.collections.find((collection) => collection.slug === 'oauth-states')!;
    const connections = result.collections.find((collection) => collection.slug === 'oauth-connections')!;
    expect(await states.access?.read?.({ req: {} as FrogbotRequest })).toBe(false);
    expect(await connections.access?.read?.({ req: { user: { id: 'user-1' } } as FrogbotRequest })).toEqual({
      owner: { equals: 'user-1' },
    });
    expect(await connections.access?.read?.({ req: {} as FrogbotRequest })).toBe(false);
    expect(connections.fields.find((field) => 'name' in field && field.name === 'encryptedTokens')).toMatchObject({
      access: { read: expect.any(Function) },
      admin: { hidden: true },
    });
  });

  it('merges transformed collections and custom owner fields', async () => {
    const input = config();
    input.collections.push({
      slug: 'oauth-connections',
      fields: [{ name: 'tenantMarker', type: 'text' }],
      endpoints: [{ method: 'get', path: '/tenant', handler: () => Response.json({}) }],
    });
    const result = await oauthPlugin({
      providers: [provider],
      ownerField: { name: 'tenant', relationTo: 'users' },
      connectionsCollection: { fields: [{ name: 'custom', type: 'json' }] },
    })(input);
    const connections = result.collections.find((collection) => collection.slug === 'oauth-connections')!;
    const names = connections.fields.map((field) => ('name' in field ? field.name : null));
    expect(names).toEqual(expect.arrayContaining(['tenant', 'tenantMarker', 'custom']));
    expect(connections.endpoints?.map((endpoint) => endpoint.path)).toContain('/tenant');
  });
});

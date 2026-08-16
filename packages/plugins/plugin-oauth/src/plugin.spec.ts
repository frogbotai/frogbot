import type { FrogbotConfig, Plugin } from 'frogbot';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { OAuthProvider } from './index.js';
import { oauthPlugin } from './index.js';

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
    expect(result.credentialSources).toEqual([
      expect.objectContaining({
        key: 'custom',
        services: ['custom-service'],
        credentialTypes: ['oauth2'],
      }),
    ]);
  });

  it('rejects duplicate and empty provider IDs', () => {
    expect(() => oauthPlugin({ providers: [provider, provider] })).toThrow(
      "Provider ID 'custom' must be unique",
    );
    expect(() => oauthPlugin({ providers: [{ ...provider, id: '' }] })).toThrow(
      'Provider IDs must not be empty',
    );
    expect(() => oauthPlugin({ providers: [{ ...provider, service: '' }] })).toThrow(
      'Provider service IDs must not be empty',
    );
  });

  it('groups pieces sharing OAuth credentials and unions scopes', async () => {
    const auth = { clientId: 'id', clientSecret: 'secret' };
    const piece = (service: string, scopes: string[]) => ({
      service,
      credentialType: 'oauth2' as const,
      policy: { type: 'oauth' as const, ...auth, source: auth },
      actions: [],
      tool: () => {
        throw new Error('unused');
      },
      tools: () => [],
      scopes,
    });
    const plugin = oauthPlugin();
    const result = await plugin({
      secret: 'test',
      db: {},
      collections: [{ slug: 'users', auth: true, fields: [] }],
      pieces: [piece('google_sheets', ['sheets']), piece('google_drive', ['drive'])],
    } as FrogbotConfig);
    expect(result.credentialSources).toEqual([
      expect.objectContaining({
        key: 'google',
        services: ['google_sheets', 'google_drive'],
        scopes: ['sheets', 'drive'],
      }),
    ]);
  });

  it('rejects sign-in providers on username-only auth collections', async () => {
    const plugin = oauthPlugin({ providers: [{ ...provider, signIn: true } as OAuthProvider] });
    expect(() =>
      plugin({
        secret: 'test',
        db: {},
        collections: [
          {
            slug: 'users',
            auth: { loginWithUsername: { allowEmailLogin: false, requireEmail: false } },
            fields: [],
          },
        ],
      } as FrogbotConfig),
    ).toThrow(/email/i);
  });

  it.each([
    { loginWithUsername: { allowEmailLogin: true, requireEmail: false } },
    { disableLocalStrategy: true },
  ])('allows sign-in providers with email-capable auth %#', async (auth) => {
    const plugin = oauthPlugin({ providers: [{ ...provider, signIn: true }] });
    expect(() =>
      plugin({
        secret: 'test',
        db: {},
        collections: [{ slug: 'users', auth, fields: [] }],
      } as FrogbotConfig),
    ).not.toThrow();
  });

  it('appends admin login buttons after existing afterLogin components', async () => {
    const existing = '@app/AfterLogin';
    const result = await oauthPlugin({
      adminLoginButtons: true,
      providers: [
        { ...provider, id: 'google', service: 'google', label: 'Google', signIn: true },
        { ...provider, id: 'microsoft', service: 'microsoft', label: 'Microsoft', signIn: true },
        { ...provider, id: 'github', service: 'github' },
      ],
    })({
      secret: 'test',
      db: {},
      admin: { components: { afterLogin: [existing] } },
      collections: [{ slug: 'users', auth: true, fields: [] }],
    } as FrogbotConfig);
    expect(result.admin?.components?.afterLogin).toEqual([
      existing,
      expect.objectContaining({
        path: '@frogbotai/plugin-oauth/client#OAuthLoginButtons',
        clientProps: expect.objectContaining({
          showDivider: true,
          providers: [
            { id: 'google', label: 'Google' },
            { id: 'microsoft', label: 'Microsoft' },
          ],
        }),
      }),
    ]);
  });

  it('falls back to the provider id when no label is set', async () => {
    const result = await oauthPlugin({
      adminLoginButtons: true,
      providers: [{ ...provider, id: 'acme', service: 'acme', signIn: true }],
    })({
      secret: 'test',
      db: {},
      collections: [{ slug: 'users', auth: true, fields: [] }],
    } as FrogbotConfig);
    expect(result.admin?.components?.afterLogin?.[0]).toMatchObject({
      clientProps: { providers: [{ id: 'acme', label: 'acme' }] },
    });
  });

  it('hides the separator when the local login form is disabled', async () => {
    const result = await oauthPlugin({
      adminLoginButtons: true,
      providers: [{ ...provider, id: 'google', service: 'google', label: 'Google', signIn: true }],
    })({
      secret: 'test',
      db: {},
      collections: [{ slug: 'users', auth: { disableLocalStrategy: true }, fields: [] }],
    } as FrogbotConfig);
    expect(result.admin?.components?.afterLogin?.[0]).toMatchObject({
      clientProps: { showDivider: false },
    });
  });
});

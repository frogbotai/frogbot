import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ConnectionError, Connections } from '../../../../packages/frogbot/src/connections/api.js';
import { createCredentialEncryption } from '../../../../packages/frogbot/src/connections/encryption.js';

async function setup(
  doc: Record<string, unknown> | undefined,
  sources: ConstructorParameters<typeof Connections>[1]['sources'] = [],
) {
  const encryption = createCredentialEncryption({ secret: 'secret' });
  const encryptedCredentials = await encryption.encrypt(JSON.stringify(doc?.credentials ?? {}));
  const stored = doc
    ? {
        id: 'id',
        services: ['service'],
        source: 'secret',
        sourceKey: 'secret',
        status: 'active',
        ...doc,
        encryptedCredentials,
      }
    : undefined;
  const find = vi.fn(async () => ({ docs: stored ? [stored] : [] }));
  const update = vi.fn(async ({ data }) => Object.assign(stored ?? {}, data));
  const api = new Connections({ find, update } as never, {
    enabled: true,
    slug: 'connections',
    encryption,
    sources,
    assignments: Object.fromEntries(
      ['service', ...sources.flatMap((source) => source.services)].map((service) => [
        service,
        'secret',
      ]),
    ),
  });
  return { api, find, update, encryption, stored };
}

describe('connections API', () => {
  it.each([
    ['secret_text', { value: 'key' }, { type: 'SECRET_TEXT', secret_text: 'key' }],
    ['basic_auth', { username: 'user', password: 'pass' }, { username: 'user', password: 'pass' }],
    [
      'oauth2',
      { access_token: 'token', scope: 'read' },
      { type: 'OAUTH2', access_token: 'token', scope: 'read' },
    ],
    ['custom', { token: 'token' }, { token: 'token', subdomain: 'acme' }],
  ])('maps %s credentials', async (credentialType, credentials, expected) => {
    const { api } = await setup({ credentialType, credentials, metadata: { subdomain: 'acme' } });
    expect(await api.resolve({ service: 'service', owner: { id: 'owner' } })).toEqual(expected);
  });

  it('lists safe metadata and revokes without returning ciphertext', async () => {
    const { api } = await setup({ credentialType: 'secret_text', credentials: { value: 'key' } });
    expect(await api.list({ owner: { id: 'owner' } })).not.toHaveProperty('0.encryptedCredentials');
    expect(await api.revoke({ service: 'service', owner: { id: 'owner' } })).not.toHaveProperty(
      'encryptedCredentials',
    );
  });

  it('falls back to a direct credential source without an owner', async () => {
    const { api } = await setup(undefined, [
      {
        key: 'secret',
        services: ['service'],
        credentialTypes: ['secret_text'],
        policy: 'developer',
        resolve: () => 'configured',
      },
    ]);
    expect(await api.resolve({ service: 'service' })).toBe('configured');
  });

  it('resolves native credentials from the user before factory auth', async () => {
    const user = await setup({ credentials: { apiKey: 'user' }, credentialType: 'custom' });
    await expect(
      user.api.resolvePieceCredential({
        piece: 'service',
        owner: { id: 'owner' },
        auth: { apiKey: 'factory' },
        authSchema: z.object({ apiKey: z.string() }),
      }),
    ).resolves.toEqual({ auth: { apiKey: 'user' }, key: expect.any(Object) });
    const factory = await setup(undefined);
    await expect(
      factory.api.resolvePieceCredential({ piece: 'service', auth: { apiKey: 'factory' } }),
    ).resolves.toEqual({ auth: { apiKey: 'factory' }, key: expect.any(Object) });
    await expect(
      factory.api.resolvePieceCredential({
        piece: 'service',
        owner: { id: 'owner' },
        auth: { apiKey: 'factory' },
      }),
    ).resolves.toEqual({ auth: { apiKey: 'factory' }, key: expect.any(Object) });
  });

  it('converts and validates native OAuth and legacy secret credentials', async () => {
    const oauth = await setup({
      source: 'oauth',
      credentialType: 'oauth2',
      credentials: { access_token: 'user' },
    });
    await expect(
      oauth.api.resolvePieceCredential({
        piece: 'service',
        owner: { id: 'owner' },
        oauthToAuth: ({ tokens }) => ({ accessToken: tokens.access_token }),
        authSchema: z.object({ accessToken: z.string() }),
      }),
    ).resolves.toEqual({ auth: { accessToken: 'user' }, key: expect.any(Object) });
    const legacy = await setup({ credentials: { value: 'legacy' }, credentialType: 'secret_text' });
    await expect(
      legacy.api.resolvePieceCredential({
        piece: 'resend',
        owner: { id: 'owner' },
        authSchema: z.object({ apiKey: z.string() }),
        legacySecretToAuth: (value) => ({ apiKey: value }),
      }),
    ).resolves.toEqual({ auth: { apiKey: 'legacy' }, key: expect.any(Object) });
    const malformed = await setup({
      source: 'oauth',
      credentialType: 'oauth2',
      credentials: {},
    });
    await expect(
      malformed.api.resolvePieceCredential({
        piece: 'service',
        owner: { id: 'owner' },
        oauthToAuth: ({ tokens }) => ({ accessToken: tokens.access_token }),
        authSchema: z.object({ accessToken: z.string() }),
      }),
    ).rejects.toMatchObject({ code: 'error' });
  });

  it('normalizes malformed native credential failures without factory fallback', async () => {
    const find = vi.fn().mockResolvedValue({
      docs: [
        {
          id: 'id',
          services: ['service'],
          source: 'oauth',
          sourceKey: 'oauth',
          credentialType: 'oauth2',
          encryptedCredentials: 'invalid',
          status: 'active',
        },
      ],
    });
    const malformedJSON = new Connections(
      { find } as never,
      {
        enabled: true,
        slug: 'connections',
        encryption: { encrypt: vi.fn(), decrypt: vi.fn().mockResolvedValue('{') },
        sources: [],
        assignments: {},
      } as never,
    );
    await expect(
      malformedJSON.resolvePieceCredential({
        piece: 'service',
        owner: { id: 'owner' },
        auth: { accessToken: 'factory' },
        authSchema: z.object({ accessToken: z.string() }),
        oauthToAuth: () => ({ accessToken: 'user' }),
      }),
    ).rejects.toMatchObject({ code: 'error' });

    const conversion = await setup({
      source: 'oauth',
      credentialType: 'oauth2',
      credentials: { access_token: 'user' },
    });
    await expect(
      conversion.api.resolvePieceCredential({
        piece: 'service',
        owner: { id: 'owner' },
        auth: { accessToken: 'factory' },
        authSchema: z.object({ accessToken: z.string() }),
        oauthToAuth: () => {
          throw new Error('conversion failed');
        },
      }),
    ).rejects.toMatchObject({ code: 'error' });
  });

  it('refreshes native credentials once and resolves the reread user auth', async () => {
    const refresh = vi.fn(async ({ connection, frogbot }) => {
      const encryptedCredentials = await createCredentialEncryption({ secret: 'secret' }).encrypt(
        JSON.stringify({ access_token: 'next' }),
      );
      await frogbot.update({
        collection: 'connections',
        id: connection.id,
        data: { encryptedCredentials, expiresAt: '2100-01-01T00:00:00.000Z' },
        overrideAccess: true,
      });
    });
    const { api, find } = await setup(
      {
        source: 'oauth',
        credentialType: 'oauth2',
        credentials: { access_token: 'old' },
        expiresAt: '2000-01-01T00:00:00.000Z',
      },
      [{ key: 'secret', services: ['service'], credentialTypes: ['oauth2'], refresh }],
    );
    const factoryKey = {};
    const result = await api.resolvePieceCredential({
      piece: 'service',
      owner: { id: 'owner' },
      auth: { accessToken: 'factory' },
      factoryKey,
      oauthToAuth: ({ tokens }) => ({ accessToken: tokens.access_token }),
      authSchema: z.object({ accessToken: z.string() }),
    });
    expect(result.auth).toEqual({ accessToken: 'next' });
    expect(result.key).not.toBe(factoryKey);
    expect(refresh).toHaveBeenCalledOnce();
    expect(find).toHaveBeenCalledTimes(2);
  });

  it.each<[string, Record<string, unknown> | undefined, string]>([
    ['missing row', undefined, 'missing'],
    ['still expired', { expiresAt: '2000-01-01T00:00:00.000Z' }, 'expired'],
    ['revoked', { status: 'revoked' }, 'revoked'],
    ['error state', { status: 'error' }, 'error'],
    ['missing credentials', { encryptedCredentials: '' }, 'missing'],
    ['invalid ciphertext', { encryptedCredentials: 'invalid' }, 'error'],
    ['invalid auth', { credentials: { access_token: 42 } }, 'error'],
  ])('rejects %s after native refresh without factory fallback', async (_name, data, code) => {
    const refresh = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error('unexpected second refresh'));
    const { api, find, encryption, stored } = await setup(
      {
        source: 'oauth',
        credentialType: 'oauth2',
        credentials: { access_token: 'old' },
        expiresAt: '2000-01-01T00:00:00.000Z',
      },
      [{ key: 'secret', services: ['service'], credentialTypes: ['oauth2'], refresh }],
    );
    const refreshed = data
      ? {
          ...stored!,
          expiresAt: '2100-01-01T00:00:00.000Z',
          ...data,
          ...(data.credentials
            ? { encryptedCredentials: await encryption.encrypt(JSON.stringify(data.credentials)) }
            : {}),
        }
      : undefined;
    find.mockResolvedValueOnce({ docs: [stored!] }).mockResolvedValue({
      docs: refreshed ? [refreshed] : [],
    });
    await expect(
      api.resolvePieceCredential({
        piece: 'service',
        owner: { id: 'owner' },
        auth: { accessToken: 'factory' },
        factoryKey: {},
        oauthToAuth: ({ tokens }) => ({ accessToken: tokens.access_token }),
        authSchema: z.object({ accessToken: z.string() }),
      }),
    ).rejects.toMatchObject({ name: 'ConnectionError', code });
    expect(refresh).toHaveBeenCalledOnce();
    expect(find).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['revoked', 'revoked'],
    ['error', 'error'],
    ['active', 'error'],
  ])(
    'rejects an expired %s native row when refresh fails or is disallowed',
    async (status, code) => {
      const refresh = vi.fn().mockRejectedValue(new Error('refresh failed'));
      const { api, find } = await setup(
        {
          source: 'oauth',
          credentialType: 'oauth2',
          credentials: { access_token: 'old' },
          expiresAt: '2000-01-01T00:00:00.000Z',
          status,
        },
        [{ key: 'secret', services: ['service'], credentialTypes: ['oauth2'], refresh }],
      );
      await expect(
        api.resolvePieceCredential({
          piece: 'service',
          owner: { id: 'owner' },
          auth: { accessToken: 'factory' },
          oauthToAuth: ({ tokens }) => ({ accessToken: tokens.access_token }),
          authSchema: z.object({ accessToken: z.string() }),
        }),
      ).rejects.toMatchObject({ name: 'ConnectionError', code });
      expect(refresh).toHaveBeenCalledTimes(status === 'active' ? 1 : 0);
      expect(find).toHaveBeenCalledOnce();
    },
  );

  it('reports missing required scopes', async () => {
    const { api } = await setup(
      { credentialType: 'oauth2', credentials: { access_token: 'token' }, scopes: ['read'] },
      [
        {
          key: 'secret',
          services: ['service'],
          credentialTypes: ['oauth2'],
          scopes: ['read', 'write'],
        },
      ],
    );
    await expect(api.resolve({ service: 'service', owner: { id: 'owner' } })).rejects.toMatchObject(
      { code: 'scopes', missingScopes: ['write'] },
    );
  });

  it('groups missing authorizations by source and excludes developer credentials', async () => {
    const { api } = await setup(undefined, [
      {
        key: 'secret',
        services: ['service', 'other'],
        credentialTypes: ['oauth2'],
        scopes: ['read'],
      },
    ]);
    await expect(
      api.authorizations({ services: ['service', 'other'], owner: { id: 'owner' } }),
    ).resolves.toEqual([
      {
        source: 'secret',
        services: ['service', 'other'],
        type: 'oauth',
        scopes: ['read'],
        authorizeUrl: '/api/users/oauth/secret/authorize',
      },
    ]);
    const developer = await setup(undefined, [
      {
        key: 'secret',
        services: ['service'],
        credentialTypes: ['secret_text'],
        policy: 'developer',
        resolve: () => 'key',
      },
    ]);
    await expect(
      developer.api.authorizations({ services: ['service'], owner: { id: 'owner' } }),
    ).resolves.toEqual([]);
  });

  it('distinguishes missing, revoked, and expired connections', async () => {
    const missing = await setup(undefined);
    await expect(
      missing.api.resolve({ service: 'service', owner: { id: 'owner' } }),
    ).rejects.toMatchObject({ code: 'missing' });
    const revoked = await setup({
      credentialType: 'secret_text',
      credentials: { value: 'key' },
      status: 'revoked',
    });
    await expect(
      revoked.api.resolve({ service: 'service', owner: { id: 'owner' } }),
    ).rejects.toMatchObject({ code: 'revoked' });
    const expired = await setup({
      credentialType: 'secret_text',
      credentials: { value: 'key' },
      expiresAt: '2000-01-01T00:00:00.000Z',
    });
    await expect(
      expired.api.resolve({ service: 'service', owner: { id: 'owner' } }),
    ).rejects.toMatchObject({ code: 'expired' });
    expect(ConnectionError).toBeDefined();
  });

  it('refreshes expired source credentials and distinguishes refresh failure', async () => {
    const refresh = vi.fn(async ({ connection, frogbot }) => {
      const encryptedCredentials = await createCredentialEncryption({ secret: 'secret' }).encrypt(
        JSON.stringify({ value: 'next' }),
      );
      await frogbot.update({
        collection: 'connections' as never,
        id: connection.id,
        data: { encryptedCredentials, expiresAt: '2100-01-01T00:00:00.000Z' },
        overrideAccess: true,
      });
    });
    const refreshed = await setup(
      {
        credentialType: 'secret_text',
        credentials: { value: 'old' },
        expiresAt: '2000-01-01T00:00:00.000Z',
      },
      [{ key: 'secret', services: ['service'], credentialTypes: ['secret_text'], refresh }],
    );
    expect(await refreshed.api.resolve({ service: 'service', owner: { id: 'owner' } })).toEqual({
      type: 'SECRET_TEXT',
      secret_text: 'next',
    });
    expect(refresh).toHaveBeenCalledOnce();

    const failed = await setup(
      {
        credentialType: 'secret_text',
        credentials: { value: 'old' },
        expiresAt: '2000-01-01T00:00:00.000Z',
      },
      [
        {
          key: 'secret',
          services: ['service'],
          credentialTypes: ['secret_text'],
          refresh: () => {
            throw new Error('failed');
          },
        },
      ],
    );
    await expect(
      failed.api.resolve({ service: 'service', owner: { id: 'owner' } }),
    ).rejects.toMatchObject({ code: 'error' });
  });
});

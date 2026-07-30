import { describe, expect, it, vi } from 'vitest';

import { createOAuthEncryption } from './server/crypto.js';
import { createOAuthCredentialSource } from './source.js';
import type { OAuthProvider } from './types.js';

const encryption = createOAuthEncryption({ secret: 'secret' });

async function setup(overrides: Partial<OAuthProvider> = {}) {
  const provider: OAuthProvider = {
    id: 'custom',
    service: 'custom-service',
    authorizationUrl: 'https://provider.test/authorize',
    tokenUrl: 'https://provider.test/token',
    scopes: [],
    authorize: () => new URL('https://provider.test/authorize'),
    exchange: async () => ({ accessToken: 'access' }),
    getAccount: async () => ({ id: 'account' }),
    refresh: vi.fn().mockResolvedValue({ accessToken: 'next' }),
    revoke: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const update = vi.fn().mockResolvedValue({});
  const source = createOAuthCredentialSource({ provider, encryption, connectionsSlug: 'connections' });
  const connection = {
    id: 'connection',
    service: 'custom-service',
    source: 'oauth' as const,
    sourceKey: 'custom',
    credentialType: 'oauth2' as const,
    encryptedCredentials: await encryption.encrypt(JSON.stringify({ access_token: 'access', refresh_token: 'refresh' })),
    status: 'active' as const,
    expiresAt: '2000-01-01T00:00:00.000Z',
  };
  return { provider, source, connection, update, frogbot: { update } as never };
}

describe('OAuth credential source', () => {
  it('refreshes expired credentials and marks failed refreshes as errors', async () => {
    const success = await setup();
    await success.source.refresh!({ connection: success.connection, frogbot: success.frogbot, owner: { id: 'owner' } });
    const stored = JSON.parse(await encryption.decrypt(success.update.mock.calls[0][0].data.encryptedCredentials));
    expect(stored).toMatchObject({ access_token: 'next', refresh_token: 'refresh' });

    const failure = await setup({ refresh: vi.fn().mockRejectedValue(new Error('invalid_grant')) });
    await expect(failure.source.refresh!({ connection: failure.connection, frogbot: failure.frogbot, owner: { id: 'owner' } })).rejects.toThrow('invalid_grant');
    expect(failure.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { status: 'error' } }));
  });

  it('revokes with providers that support revocation', async () => {
    const current = await setup();
    await current.source.revoke!({ connection: current.connection, frogbot: current.frogbot, owner: { id: 'owner' } });
    expect(current.provider.revoke).toHaveBeenCalledWith(expect.objectContaining({ tokens: expect.objectContaining({ accessToken: 'access' }) }));
  });
});

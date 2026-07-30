import { describe, expect, it, vi } from 'vitest';

import { ConnectionError, Connections } from './api.js';
import { createCredentialEncryption } from './encryption.js';

async function setup(doc: Record<string, unknown> | undefined, sources: ConstructorParameters<typeof Connections>[1]['sources'] = []) {
  const encryption = createCredentialEncryption({ secret: 'secret' });
  const encryptedCredentials = await encryption.encrypt(JSON.stringify(doc?.credentials ?? {}));
  const stored = doc ? { id: 'id', services: ['service'], source: 'secret', sourceKey: 'secret', status: 'active', ...doc, encryptedCredentials } : undefined;
  const find = vi.fn(async () => ({ docs: stored ? [stored] : [] }));
  const update = vi.fn(async ({ data }) => Object.assign(stored ?? {}, data));
  const api = new Connections({ find, update } as never, {
    enabled: true,
    slug: 'connections',
    encryption,
    sources,
    assignments: Object.fromEntries(['service', ...sources.flatMap((source) => source.services)].map((service) => [service, 'secret'])),
  });
  return { api, find, update };
}

describe('connections API', () => {
  it.each([
    ['secret_text', { value: 'key' }, 'key'],
    ['basic_auth', { username: 'user', password: 'pass' }, { username: 'user', password: 'pass' }],
    ['oauth2', { access_token: 'token', scope: 'read' }, { type: 'OAUTH2', access_token: 'token', scope: 'read' }],
    ['custom', { token: 'token' }, { token: 'token', subdomain: 'acme' }],
  ])('maps %s credentials', async (credentialType, credentials, expected) => {
    const { api } = await setup({ credentialType, credentials, metadata: { subdomain: 'acme' } });
    expect(await api.resolve({ service: 'service', owner: { id: 'owner' } })).toEqual(expected);
  });

  it('lists safe metadata and revokes without returning ciphertext', async () => {
    const { api } = await setup({ credentialType: 'secret_text', credentials: { value: 'key' } });
    expect(await api.list({ owner: { id: 'owner' } })).not.toHaveProperty('0.encryptedCredentials');
    expect(await api.revoke({ service: 'service', owner: { id: 'owner' } })).not.toHaveProperty('encryptedCredentials');
  });

  it('falls back to a direct credential source without an owner', async () => {
    const { api } = await setup(undefined, [{
      key: 'secret', services: ['service'], credentialTypes: ['secret_text'], policy: 'developer', resolve: () => 'configured',
    }]);
    expect(await api.resolve({ service: 'service' })).toBe('configured');
  });

  it('reports missing required scopes', async () => {
    const { api } = await setup(
      { credentialType: 'oauth2', credentials: { access_token: 'token' }, scopes: ['read'] },
      [{ key: 'secret', services: ['service'], credentialTypes: ['oauth2'], scopes: ['read', 'write'] }],
    );
    await expect(api.resolve({ service: 'service', owner: { id: 'owner' } })).rejects.toMatchObject({ code: 'scopes', missingScopes: ['write'] });
  });

  it('groups missing authorizations by source and excludes developer credentials', async () => {
    const { api } = await setup(undefined, [{ key: 'secret', services: ['service', 'other'], credentialTypes: ['oauth2'], scopes: ['read'] }]);
    await expect(api.authorizations({ services: ['service', 'other'], owner: { id: 'owner' } })).resolves.toEqual([{
      source: 'secret', services: ['service', 'other'], type: 'oauth', scopes: ['read'], authorizeUrl: '/api/users/oauth/secret/authorize',
    }]);
    const developer = await setup(undefined, [{ key: 'secret', services: ['service'], credentialTypes: ['secret_text'], policy: 'developer', resolve: () => 'key' }]);
    await expect(developer.api.authorizations({ services: ['service'], owner: { id: 'owner' } })).resolves.toEqual([]);
  });

  it('distinguishes missing, revoked, and expired connections', async () => {
    const missing = await setup(undefined);
    await expect(missing.api.resolve({ service: 'service', owner: { id: 'owner' } })).rejects.toMatchObject({ code: 'missing' });
    const revoked = await setup({ credentialType: 'secret_text', credentials: { value: 'key' }, status: 'revoked' });
    await expect(revoked.api.resolve({ service: 'service', owner: { id: 'owner' } })).rejects.toMatchObject({ code: 'revoked' });
    const expired = await setup({ credentialType: 'secret_text', credentials: { value: 'key' }, expiresAt: '2000-01-01T00:00:00.000Z' });
    await expect(expired.api.resolve({ service: 'service', owner: { id: 'owner' } })).rejects.toMatchObject({ code: 'expired' });
    expect(ConnectionError).toBeDefined();
  });

  it('refreshes expired source credentials and distinguishes refresh failure', async () => {
    const refresh = vi.fn(async ({ connection, frogbot }) => {
      const encryptedCredentials = await createCredentialEncryption({ secret: 'secret' }).encrypt(JSON.stringify({ value: 'next' }));
      await frogbot.update({ collection: 'connections' as never, id: connection.id, data: { encryptedCredentials, expiresAt: '2100-01-01T00:00:00.000Z' }, overrideAccess: true });
    });
    const refreshed = await setup(
      { credentialType: 'secret_text', credentials: { value: 'old' }, expiresAt: '2000-01-01T00:00:00.000Z' },
      [{ key: 'secret', services: ['service'], credentialTypes: ['secret_text'], refresh }],
    );
    expect(await refreshed.api.resolve({ service: 'service', owner: { id: 'owner' } })).toBe('next');
    expect(refresh).toHaveBeenCalledOnce();

    const failed = await setup(
      { credentialType: 'secret_text', credentials: { value: 'old' }, expiresAt: '2000-01-01T00:00:00.000Z' },
      [{ key: 'secret', services: ['service'], credentialTypes: ['secret_text'], refresh: () => { throw new Error('failed'); } }],
    );
    await expect(failed.api.resolve({ service: 'service', owner: { id: 'owner' } })).rejects.toMatchObject({ code: 'error' });
  });
});

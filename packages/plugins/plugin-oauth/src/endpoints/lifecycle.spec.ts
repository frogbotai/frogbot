import { describe, expect, it, vi } from 'vitest';

import type { FrogbotConfig, FrogbotRequest } from 'frogbot';
import { oauthPlugin } from '../index.js';
import type { OAuthProvider } from '../index.js';
import { createOAuthEncryption } from '../server.js';

const encryption = createOAuthEncryption({ secret: 'test' });

async function setup(overrides: Partial<OAuthProvider> = {}) {
  const provider: OAuthProvider = {
    id: 'custom', service: 'custom-service', authorizationUrl: 'https://provider.test/auth', tokenUrl: 'https://provider.test/token', scopes: [],
    authorize: () => new URL('https://provider.test/auth'), exchange: async () => ({ accessToken: 'access' }), getAccount: async () => ({ id: 'account' }),
    refresh: vi.fn().mockResolvedValue({ accessToken: 'next' }), revoke: vi.fn().mockResolvedValue(undefined), ...overrides,
  };
  const config = await oauthPlugin({ providers: [provider], encryption })({
    secret: 'test', db: {} as FrogbotConfig['db'], collections: [{ slug: 'users', auth: true, fields: [] }],
  });
  return { provider, endpoints: config.collections[0]!.endpoints! };
}

function request({ encryptedCredentials, owner = 'user-1' }: { encryptedCredentials: string; owner?: string }) {
  const update = vi.fn().mockResolvedValue({});
  return {
    req: {
      routeParams: { provider: 'custom' }, user: { id: owner }, json: () => Promise.resolve({ connectionId: 'connection-1' }),
      frogbot: {
        find: vi.fn().mockResolvedValue({ docs: [{ id: 'connection-1', owner, sourceKey: 'custom', accountId: 'account', encryptedCredentials }] }),
        update,
      },
    } as unknown as FrogbotRequest,
    update,
  };
}

describe('OAuth connection lifecycle', () => {
  it('refreshes tokens while retaining an omitted refresh token', async () => {
    const { endpoints } = await setup();
    const refresh = endpoints.find((endpoint) => endpoint.path.endsWith('/refresh'))!;
    const encryptedCredentials = await encryption.encrypt(JSON.stringify({ access_token: 'access', refresh_token: 'keep' }));
    const { req, update } = request({ encryptedCredentials });
    expect((await refresh.handler(req)).status).toBe(200);
    const stored = JSON.parse(await encryption.decrypt(update.mock.calls[0][0].data.encryptedCredentials));
    expect(stored).toMatchObject({ access_token: 'next', refresh_token: 'keep' });
  });

  it('marks failed refreshes as errors', async () => {
    const { endpoints } = await setup({ refresh: vi.fn().mockRejectedValue(new Error('invalid_grant')) });
    const refresh = endpoints.find((endpoint) => endpoint.path.endsWith('/refresh'))!;
    const { req, update } = request({ encryptedCredentials: await encryption.encrypt(JSON.stringify({ access_token: 'access' })) });
    expect((await refresh.handler(req)).status).toBe(502);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'error' } }));
  });

  it('revokes locally when provider revocation fails and denies cross-owner lookup', async () => {
    const { endpoints } = await setup({ revoke: vi.fn().mockRejectedValue(new Error('offline')) });
    const revoke = endpoints.find((endpoint) => endpoint.path.endsWith('/revoke'))!;
    const { req, update } = request({ encryptedCredentials: await encryption.encrypt(JSON.stringify({ access_token: 'access' })) });
    const response = await revoke.handler(req);
    expect(await response.json()).toMatchObject({ status: 'revoked', providerRevoked: false });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'revoked', encryptedCredentials: '' } }));
    const find = req.frogbot.find as ReturnType<typeof vi.fn>;
    expect(find.mock.calls[0][0].where).toEqual({ and: [{ id: { equals: 'connection-1' } }, { owner: { equals: 'user-1' } }] });
  });
});

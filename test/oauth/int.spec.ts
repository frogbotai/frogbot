import { describe, expect, it, vi } from 'vitest';

import type { FrogbotRequest } from 'frogbot';
import { createCredentialEncryption } from 'frogbot/connections';
import { createActivepiecesPiece } from 'frogbot/pieces';
import { Connections } from '../../packages/frogbot/src/connections/api.js';
import { config } from './config.js';

describe('OAuth plugin integration', () => {
  it('composes authorize, persistence, resolution, piece execution, refresh, and revoke', async () => {
    let transformed = config;
    for (const plugin of config.plugins ?? []) transformed = await plugin(transformed);

    const connections = transformed.collections.find((collection) => collection.slug === 'connections')!;
    const fields = connections.fields.map((field) => 'name' in field ? field.name : null);
    expect(fields).toEqual(expect.arrayContaining(['environment', 'tenantMarker']));
    expect(connections.connections).toBe(true);

    const accounts = transformed.collections.find((collection) => collection.slug === 'accounts')!;
    const authorize = accounts.endpoints!.find((endpoint) => endpoint.path.endsWith('/authorize'))!;
    const callback = accounts.endpoints!.find((endpoint) => endpoint.method === 'get' && endpoint.path.endsWith('/callback'))!;
    const refresh = accounts.endpoints!.find((endpoint) => endpoint.path.endsWith('/refresh'))!;
    const revoke = accounts.endpoints!.find((endpoint) => endpoint.path.endsWith('/revoke'))!;
    const create = vi.fn().mockResolvedValueOnce({ id: 'state-1' }).mockResolvedValueOnce({ id: 'connection-1' });
    const authorizeResponse = await authorize.handler({
      routeParams: { provider: 'custom' }, user: { id: 'user-1' }, headers: new Headers(),
      searchParams: new URLSearchParams({ returnUrl: '/settings' }), frogbot: { create },
    } as unknown as FrogbotRequest);
    const state = create.mock.calls[0][0].data;
    expect(authorizeResponse.headers.get('location')).toContain('https://provider.test/authorize');

    const find = vi.fn().mockResolvedValueOnce({ docs: [] });
    const update = vi.fn().mockResolvedValue({});
    const callbackResponse = await callback.handler({
      method: 'GET', routeParams: { provider: 'custom' }, headers: new Headers(),
      searchParams: new URLSearchParams({ code: 'code', state: state.state }),
      frogbot: { delete: vi.fn().mockResolvedValue({ docs: [{ id: 'state-1', ...state }] }), find, create },
    } as unknown as FrogbotRequest);
    expect(callbackResponse.headers.get('location')).toBe('https://app.test/settings?oauth_connection=connection-1');

    const connection = { id: 'connection-1', ...create.mock.calls[1][0].data };
    expect(connection).toMatchObject({ services: ['custom-service'], source: 'oauth', sourceKey: 'custom', accountId: 'account-1' });

    const connectionAPI = new Connections({
      find: vi.fn().mockResolvedValue({ docs: [connection] }),
      update,
    } as never, {
      enabled: true,
      slug: 'connections',
      encryption: createCredentialEncryption({ secret: 'oauth-test' }),
      sources: transformed.credentialSources!,
      assignments: { 'custom-service': 'custom' },
    });
    const action = { name: 'run', displayName: 'Run', description: 'Run', props: {}, run: vi.fn(async ({ auth }) => auth) };
    const piece = createActivepiecesPiece({
      module: { piece: { metadata: () => ({}), actions: () => ({ run: action }), getAction: () => action } },
      service: 'custom-service',
      credentialType: 'oauth2',
      defaultActions: ['run'],
    });
    await expect(piece.tools()[0]!.execute({}, {
      req: { user: { id: 'user-1' } },
      frogbot: { connections: connectionAPI },
    } as never)).resolves.toMatchObject({ type: 'OAUTH2', access_token: 'access', refresh_token: 'refresh' });

    const lifecycleRequest = () => ({
      routeParams: { provider: 'custom' }, user: { id: 'user-1' }, json: () => Promise.resolve({ connectionId: 'connection-1' }),
      frogbot: { find: vi.fn().mockResolvedValue({ docs: [connection] }), update },
    }) as unknown as FrogbotRequest;
    expect((await refresh.handler(lifecycleRequest())).status).toBe(200);
    expect((await revoke.handler(lifecycleRequest())).status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'revoked', encryptedCredentials: '' } }));
  });
});

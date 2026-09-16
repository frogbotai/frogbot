import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { Connections } from '../../../packages/frogbot/src/connections/api.js';
import { resolveConnectionsCollections } from '../../../packages/frogbot/src/connections/resolveCollections.js';
import {
  pieceFactoryDefinition,
  pieceInstanceRuntime,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import type { FrogbotRequest } from '../../../packages/frogbot/src/types/request.js';
import { createGithub } from '../../../packages/pieces/piece-github/src/index.js';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

const appAuth = { appId: '12345', privateKey: 'private-key', installationId: 67890 };

afterEach(() => vi.unstubAllGlobals());

describe('GitHub connections', () => {
  it('initializes a static credential form alongside fixed App credentials', () => {
    const github = createGithub({ auth: appAuth });
    const { connections } = resolveConnectionsCollections({
      db: {} as never,
      secret: 'test-secret',
      collections: [{ slug: 'users', auth: true, fields: [] }],
      connections: [{ piece: github, secret: true }],
    });

    expect(connections.entries.github).toMatchObject({
      piece: github,
      oauth: false,
      secret: true,
      secretSchema: {
        type: 'object',
        properties: {
          accessToken: { type: 'string', minLength: 1, secret: true },
          appId: { type: 'string', minLength: 1 },
          privateKey: { type: 'string', minLength: 1, secret: true },
          installationId: { type: 'integer', exclusiveMinimum: 0, label: 'Installation ID' },
        },
      },
    });
    expect(pieceInstanceRuntime(github).auth).toEqual(appAuth);
  });

  it('coerces factory installation IDs and retains only the selected App credential', () => {
    const github = createGithub({
      auth: { ...appAuth, installationId: '67890', accessToken: 'unused-token' },
    });

    expect(pieceInstanceRuntime(github).auth).toEqual(appAuth);
  });

  it.each([
    {},
    { accessToken: '' },
    { appId: '12345' },
    { ...appAuth, installationId: 0 },
    { ...appAuth, installationId: '0' },
    { ...appAuth, installationId: '1.5' },
    { ...appAuth, installationId: 'invalid' },
  ])('rejects incomplete credentials %j', (auth) => {
    expect(pieceFactoryDefinition(createGithub).auth?.safeParse(auth).success).toBe(false);
  });

  it.each(['secret', 'oauth'] as const)(
    'uses the linked %s token for action requests and retains fixed App auth',
    async (method) => {
      const github = createGithub({
        auth: appAuth,
        oauth: { clientId: 'client', clientSecret: 'secret' },
      });

      const { connections } = resolveConnectionsCollections({
        db: {} as never,
        secret: 'test-secret',
        collections: [{ slug: 'users', auth: true, fields: [] }],
        connections: [{ piece: github, secret: true, oauth: true }],
      });

      const credential =
        method === 'secret'
          ? { accessToken: 'user-token' }
          : { access_token: 'user-token', scope: 'admin:repo_hook admin:org repo gist user:email' };

      const row = {
        id: 'connection',
        owner: 'owner',
        piece: 'github',
        method,
        status: 'active',
        credential: await connections.encryption.encrypt(JSON.stringify(credential)),
        scopes: ['admin:repo_hook', 'admin:org', 'repo', 'gist', 'user:email'],
      };

      const frogbot = {
        config: { _internal: { payloadConfig: Promise.resolve({ admin: { user: 'users' } }) } },
        find: vi.fn().mockResolvedValue({ docs: [row] }),
      };

      const api = new Connections(frogbot as never, connections);
      const req = {
        user: { id: 'owner', collection: 'users' },
        frogbot: { ...frogbot, connections: api },
      } as unknown as FrogbotRequest;

      const fetch = vi.fn().mockResolvedValue(Response.json({ id: 42 }));

      vi.stubGlobal('fetch', fetch);

      const client = await github.client({ req });
      const result = await client.request('/user', z.object({ id: z.number() }));

      expect(result).toEqual({ id: 42 });
      expect(new Headers(fetch.mock.calls[0]?.[1].headers).get('authorization')).toBe(
        'Bearer user-token',
      );
      expect(pieceInstanceRuntime(github).auth).toEqual(appAuth);

      frogbot.find.mockResolvedValue({ docs: [] });

      await expect(api.resolve({ piece: github, req })).resolves.toEqual(appAuth);
    },
  );
});

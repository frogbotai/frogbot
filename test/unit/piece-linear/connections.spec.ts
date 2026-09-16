import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { Connections } from '../../../packages/frogbot/src/connections/api.js';
import { createCredentialEncryption } from '../../../packages/frogbot/src/connections/encryption.js';
import { createOAuthState } from '../../../packages/frogbot/src/connections/oauth/state.js';
import { resolveConnectionsCollections } from '../../../packages/frogbot/src/connections/resolveCollections.js';
import {
  pieceFactoryDefinition,
  pieceInstanceRuntime,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import type { FrogbotRequest } from '../../../packages/frogbot/src/types/request.js';
import { createLinear } from '../../../packages/pieces/piece-linear/src/index.js';
import { memoryKV } from '../frogbot/connections/oauth/fixtures.js';

afterEach(() => vi.unstubAllGlobals());

describe('Linear connections', () => {
  it('enables the existing API-key credential form without an OAuth application', () => {
    const linear = createLinear();
    const { connections } = resolveConnectionsCollections({
      db: {} as never,
      secret: 'test-secret',
      collections: [{ slug: 'users', auth: true, fields: [] }],
      connections: [{ piece: linear, secret: true }],
    });

    expect(connections.entries.linear).toMatchObject({
      piece: linear,
      oauth: false,
      secret: true,
      secretSchema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', minLength: 1, secret: true },
          accessToken: { type: 'string', minLength: 1, secret: true },
        },
      },
    });

    const recipe = pieceFactoryDefinition(createLinear);

    expect(recipe.oauth).toMatchObject({
      authorizationUrl: 'https://linear.app/oauth/authorize',
      tokenUrl: 'https://api.linear.app/oauth/token',
      params: { actor: 'app' },
    });
    expect(recipe.auth?.safeParse({}).success).toBe(false);
    expect(recipe.auth?.safeParse({ apiKey: '' }).success).toBe(false);
    expect(recipe.auth?.safeParse({ apiKey: 'lin_api_test' }).success).toBe(true);
    expect(recipe.auth?.safeParse({ accessToken: '' }).success).toBe(false);
    expect(recipe.auth?.safeParse({ accessToken: 'oauth-token' }).success).toBe(true);
  });

  it('requires OAuth application credentials to enable linking', () => {
    expect(() =>
      resolveConnectionsCollections({
        secret: 'test-secret',
        collections: [{ slug: 'users', auth: true, fields: [] }],
        connections: [{ piece: createLinear(), oauth: true }],
      } as never),
    ).toThrow("Connection 'linear' requires factory OAuth clientId and clientSecret.");
  });

  it.each([
    { scopes: undefined, expected: 'read,write,comments:create,issues:create,app:mentionable' },
    {
      scopes: ['read', 'comments:create', 'app:mentionable'],
      expected: 'read,comments:create,app:mentionable',
    },
  ])('serializes Linear authorization scopes as $expected', async ({ scopes, expected }) => {
    const linear = createLinear({
      oauth: { clientId: 'client', clientSecret: 'secret', scopes },
    });

    const { kv } = memoryKV();

    const flow = await createOAuthState({
      kv,
      encryption: createCredentialEncryption({ secret: 'test-secret' }),
      piece: linear,
      flow: 'link',
      collection: 'users',
      callbackUrl: 'https://app.test/api/connections/linear/callback',
      returnTo: '/',
      req: { user: { id: 'owner', collection: 'users' } } as FrogbotRequest,
    });

    const url = new URL(flow.authorizationUrl);

    expect(url.origin + url.pathname).toBe('https://linear.app/oauth/authorize');
    expect(url.searchParams.get('scope')).toBe(expected);
    expect(url.searchParams.get('actor')).toBe('app');
    expect(url.searchParams.get('state')).toBe(flow.state);
  });

  it.each([
    { method: 'secret', credential: { apiKey: 'lin_api_user' }, authorization: 'lin_api_user' },
    {
      method: 'secret',
      credential: { accessToken: 'user-token' },
      authorization: 'Bearer user-token',
    },
    {
      method: 'oauth',
      credential: {
        access_token: 'user-token',
        scope: 'read write comments:create issues:create app:mentionable',
      },
      authorization: 'Bearer user-token',
    },
  ] as const)(
    'uses $authorization from a linked $method connection for actions',
    async ({ method, credential, authorization }) => {
      const auth = { accessToken: 'fixed-bot-token' };
      const linear = createLinear({
        auth,
        oauth: { clientId: 'client', clientSecret: 'secret' },
      });

      const { connections } = resolveConnectionsCollections({
        db: {} as never,
        secret: 'test-secret',
        collections: [{ slug: 'users', auth: true, fields: [] }],
        connections: [{ piece: linear, secret: true, oauth: true }],
      });

      const row = {
        id: 'connection',
        owner: 'owner',
        piece: 'linear',
        method,
        status: 'active',
        credential: await connections.encryption.encrypt(JSON.stringify(credential)),
        scopes: ['read', 'write', 'comments:create', 'issues:create', 'app:mentionable'],
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

      const fetch = vi
        .fn()
        .mockResolvedValue(Response.json({ data: { viewer: { id: 'linear-user' } } }));

      vi.stubGlobal('fetch', fetch);

      const client = await linear.client({ req });
      const viewer = await client.viewer;

      expect(viewer.id).toBe('linear-user');
      expect(new Headers(fetch.mock.calls[0]?.[1].headers).get('authorization')).toBe(
        authorization,
      );
      expect(pieceInstanceRuntime(linear).auth).toEqual(auth);

      if (method === 'oauth') {
        row.scopes.pop();

        await expect(api.resolve({ piece: linear, req })).rejects.toMatchObject({
          code: 'scopes',
          missingScopes: ['app:mentionable'],
        });
      }

      frogbot.find.mockResolvedValue({ docs: [] });

      await expect(api.resolve({ piece: linear, req })).resolves.toEqual(auth);
    },
  );
});

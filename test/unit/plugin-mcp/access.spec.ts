import type { Tool } from 'frogbot';
import { UnauthorizedError } from 'payload';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  createApiKeyToken,
  hashApiKeyToken,
} from '../../../packages/plugins/plugin-api-keys/src/server/token.js';
import { createApiKeyStrategy } from '../../../packages/plugins/plugin-api-keys/src/strategy.js';

type Item = { type: string; tool?: { access?: (args: { req: unknown }) => Promise<boolean> } };

const filterMCPItems = vi.hoisted(() =>
  vi.fn(async ({ items, req }: { items: Item[]; req: unknown }) => {
    const allowed = await Promise.all(
      items.map((item) =>
        item.type === 'tool' && item.tool?.access
          ? item.tool.access({ req })
          : Promise.resolve(true),
      ),
    );

    return items.filter((_, index) => allowed[index]);
  }),
);

vi.mock('@payloadcms/plugin-mcp/internal', () => ({ filterMCPItems }));

vi.mock(
  '@frogbotai/plugin-api-keys',
  () => import('../../../packages/plugins/plugin-api-keys/src/index.js'),
);

const { authorizeMcp } = await import('../../../packages/plugins/plugin-mcp/src/access.js');
const { toPayloadTools } = await import('../../../packages/plugins/plugin-mcp/src/tools.js');

function setup({ revoked = false } = {}) {
  const token = createApiKeyToken();
  const frogbot = {
    logger: { error: vi.fn(), warn: vi.fn() },
    find: vi.fn().mockImplementation(({ where }) =>
      Promise.resolve({
        docs:
          where.tokenHash.equals === hashApiKeyToken(token)
            ? [
                {
                  id: 'key-1',
                  owner: 'user-1',
                  ...(revoked && { revokedAt: '2026-01-01T00:00:00.000Z' }),
                },
              ]
            : [],
      }),
    ),
    findByID: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
    update: vi.fn().mockResolvedValue({}),
    auth: vi.fn().mockResolvedValue({ permissions: {}, user: null }),
  };

  const strategy = createApiKeyStrategy({
    authCollection: 'users',
    collectionSlug: 'api-keys',
    tokenPrefix: 'fb',
  });

  const request = (value: string, responseHeaders?: Headers) =>
    ({
      headers: new Headers({ authorization: `Bearer ${value}` }),
      responseHeaders,
      frogbot,
      payload: {
        config: {
          routes: { api: '/api' },
          collections: [
            { slug: 'posts' },
            { slug: 'api-keys', custom: { frogbot: { internal: true } } },
          ],
        },
      },
    }) as never;

  return { frogbot, request, strategy, token };
}

const tool = (type: string, collectionSlug?: string) => ({
  type,
  configKey: 'find',
  label: 'find',
  mcpName: 'findDocuments',
  ...(collectionSlug ? { collectionSlug } : {}),
});

const pluginConfig = {
  items: [tool('collectionTool', 'posts'), tool('collectionTool', 'api-keys'), tool('tool')],
} as never;

describe('authorizeMcp', () => {
  it('signs in the key owner and lists items without FrogBot collections, enforcing access', async () => {
    const { request, strategy, token } = setup();
    const req = request(token);

    await expect(
      authorizeMcp({ collection: 'users', strategy, pluginConfig, req }),
    ).resolves.toEqual({
      items: [tool('collectionTool', 'posts'), tool('tool')],
      overrideAccess: false,
    });
    expect(req).toMatchObject({
      user: { id: 'user-1', collection: 'users', _strategy: 'api-key', apiKeyId: 'key-1' },
    });
    expect(filterMCPItems).toHaveBeenCalledWith(
      expect.objectContaining({ overrideAccess: false, req }),
    );
  });

  it.each([
    ['invalid key', () => setup(), 'fb_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    ['plaintext lookalike', () => setup(), 'fb_plaintext'],
  ])('rejects %s', async (_name, makeSetup, replacement) => {
    const { request, strategy, token } = makeSetup();

    await expect(
      authorizeMcp({
        collection: 'users',
        strategy,
        pluginConfig,
        req: request(replacement ?? token),
      }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('rejects a revoked key with 401, saying when it was revoked', async () => {
    const { request, strategy, token } = setup({ revoked: true });
    const req = request(token);
    const message =
      'API key was revoked at 2026-01-01T00:00:00.000Z. Mint a new one with POST /api/api-keys/mint.';

    await expect(
      authorizeMcp({ collection: 'users', strategy, pluginConfig, req }),
    ).rejects.toMatchObject({ message, status: 401 });
    expect((req as { responseHeaders: Headers }).responseHeaders.get('WWW-Authenticate')).toBe(
      `Bearer error="invalid_token", error_description="${message}"`,
    );
  });

  describe("the app's own strategies", () => {
    const bearer = 'oauth-access-token';

    it('sign in a request without an API key, keeping the user collection', async () => {
      const { frogbot, request, strategy } = setup();
      const req = request(bearer);

      frogbot.auth.mockResolvedValue({
        permissions: {},
        user: { id: 'member-1', collection: 'members', _strategy: 'oauth-bearer' },
      });

      await authorizeMcp({ collection: 'users', strategy, pluginConfig, req });

      expect(req).toMatchObject({
        user: { id: 'member-1', collection: 'members', _strategy: 'oauth-bearer' },
      });

      const [{ headers }] = frogbot.auth.mock.calls[0] as [{ headers: Headers }];

      expect(headers.get('authorization')).toBe(`Bearer ${bearer}`);
      expect(headers.get('DisableAutologin')).toBe('true');
    });

    it('leave a user without a collection without one, as REST does', async () => {
      const { frogbot, request, strategy } = setup();
      const req = request(bearer);

      frogbot.auth.mockResolvedValue({ permissions: {}, user: { id: 'user-2' } });

      await authorizeMcp({ collection: 'users', strategy, pluginConfig, req });

      expect(req.user).toEqual({ id: 'user-2' });
    });

    it('run only after the API key, and not when it signs in', async () => {
      const { frogbot, request, strategy, token } = setup();
      const req = request(token);

      frogbot.auth.mockResolvedValue({
        permissions: {},
        user: { id: 'other', collection: 'users' },
      });

      await authorizeMcp({ collection: 'users', strategy, pluginConfig, req });

      expect(req).toMatchObject({ user: { id: 'user-1', _strategy: 'api-key' } });
      expect(frogbot.auth).not.toHaveBeenCalled();
    });

    it('still sign in when the API-key strategy throws, and log the failure', async () => {
      const { frogbot, request, strategy, token } = setup();
      const failure = new Error('key storage down');
      const req = request(token);

      frogbot.find.mockRejectedValue(failure);

      frogbot.auth.mockResolvedValue({
        permissions: {},
        user: { id: 'user-3', collection: 'users' },
      });

      await authorizeMcp({ collection: 'users', strategy, pluginConfig, req });

      expect(req).toMatchObject({ user: { id: 'user-3' } });
      expect(frogbot.logger.error).toHaveBeenCalledWith(
        { err: failure },
        "[frogbot] auth strategy 'api-key' on 'users' failed",
      );
    });
  });

  describe('resourceMetadataURL', () => {
    const resourceMetadataURL = 'https://app.example.com/.well-known/oauth-protected-resource';

    it('adds WWW-Authenticate to the 401, keeping headers already set', async () => {
      const { request, strategy } = setup();
      const req = request('unknown', new Headers({ 'x-kept': 'yes' }));

      await expect(
        authorizeMcp({ collection: 'users', strategy, pluginConfig, req, resourceMetadataURL }),
      ).rejects.toThrow(UnauthorizedError);

      const { responseHeaders } = req as { responseHeaders: Headers };

      expect(responseHeaders.get('WWW-Authenticate')).toBe(
        `Bearer resource_metadata="${resourceMetadataURL}"`,
      );
      expect(responseHeaders.get('x-kept')).toBe('yes');
    });

    it('leaves the response headers alone without the option or when someone signs in', async () => {
      const { request, strategy, token } = setup();
      const rejected = request('unknown');
      const signedIn = request(token);

      await expect(
        authorizeMcp({ collection: 'users', strategy, pluginConfig, req: rejected }),
      ).rejects.toThrow(UnauthorizedError);

      await authorizeMcp({
        collection: 'users',
        strategy,
        pluginConfig,
        req: signedIn,
        resourceMetadataURL,
      });

      expect((rejected as { responseHeaders?: Headers }).responseHeaders).toBeUndefined();
      expect((signedIn as { responseHeaders?: Headers }).responseHeaders).toBeUndefined();
    });
  });

  describe('a tool with access', () => {
    const refund = {
      slug: 'refund',
      description: 'Refund an order.',
      inputSchema: z.object({}),
      execute: () => 'refunded',
    };

    async function itemsFor(access: Tool['access']) {
      const { refund: payloadTool } = toPayloadTools([{ ...refund, access }]);
      const { request, strategy, token } = setup();
      const restricted = { type: 'tool', mcpName: 'refund', tool: payloadTool };
      const { items } = await authorizeMcp({
        collection: 'users',
        strategy,
        pluginConfig: { items: [tool('tool'), restricted] } as never,
        req: request(token),
      });

      return items.map((item) => (item as { mcpName: string }).mcpName);
    }

    it("lists it only for a key whose owner passes the tool's rule", async () => {
      const access = vi.fn<NonNullable<Tool['access']>>(({ req }) => req.user?.id === 'user-1');

      await expect(itemsFor(access)).resolves.toEqual(['findDocuments', 'refund']);
      await expect(itemsFor(() => false)).resolves.toEqual(['findDocuments']);
      expect(access).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ tool: { slug: 'refund' } }),
      );
    });

    it('leaves it out when the rule throws', async () => {
      await expect(
        itemsFor(() => {
          throw new Error('broken');
        }),
      ).resolves.toEqual(['findDocuments']);
    });
  });
});

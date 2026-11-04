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

const { authorizeMcp } = await import('../../../packages/plugins/plugin-mcp/src/access.js');
const { toPayloadTools } = await import('../../../packages/plugins/plugin-mcp/src/tools.js');

function setup({ revoked = false } = {}) {
  const token = createApiKeyToken();
  const frogbot = {
    logger: { error: vi.fn(), warn: vi.fn() },
    find: vi.fn().mockImplementation(({ where }) =>
      Promise.resolve({
        docs:
          revoked || where.and[0].tokenHash.equals !== hashApiKeyToken(token)
            ? []
            : [{ id: 'key-1', owner: 'user-1' }],
      }),
    ),
    findByID: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
    update: vi.fn().mockResolvedValue({}),
  };

  const strategy = createApiKeyStrategy({
    authCollection: 'users',
    collectionSlug: 'api-keys',
    tokenPrefix: 'fb',
  });

  const request = (value: string) =>
    ({
      headers: new Headers({ authorization: `Bearer ${value}` }),
      frogbot,
      payload: {
        config: {
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
    ['revoked key', () => setup({ revoked: true }), null],
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

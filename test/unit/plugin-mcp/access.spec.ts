import { UnauthorizedError } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import {
  createApiKeyToken,
  hashApiKeyToken,
} from '../../../packages/plugins/plugin-api-keys/src/server/token.js';
import { createApiKeyStrategy } from '../../../packages/plugins/plugin-api-keys/src/strategy.js';
import { resolveMcpAccess } from '../../../packages/plugins/plugin-mcp/src/access.js';

function setup({ revoked = false } = {}) {
  const token = createApiKeyToken();
  const payload = {
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
      payload,
    }) as never;
  return { request, strategy, token };
}

const pluginOptions = {
  collections: {
    'blog-posts': { enabled: { create: true, find: true } },
    pages: { enabled: true },
  },
  globals: { 'site-settings': { enabled: { find: true } } },
  mcp: {
    tools: [{ name: 'send-email' }],
    prompts: [{ name: 'write summary' }],
    resources: [{ name: 'brand_guide' }],
  },
} as never;

describe('resolveMcpAccess', () => {
  it('authenticates the raw key and grants configured capabilities in Payload MCP shape', async () => {
    const { request, strategy, token } = setup();

    await expect(
      resolveMcpAccess({ authenticate: strategy.authenticate, pluginOptions, req: request(token) }),
    ).resolves.toMatchObject({
      user: { id: 'user-1', _strategy: 'api-key', apiKeyId: 'key-1' },
      blogPosts: { create: true, find: true },
      pages: { create: true, delete: true, find: true, update: true },
      siteSettings: { find: true },
      'payload-mcp-tool': { sendEmail: true },
      'payload-mcp-prompt': { writeSummary: true },
      'payload-mcp-resource': { brandGuide: true },
    });
  });

  it.each([
    ['invalid key', () => setup(), 'fb_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    ['plaintext lookalike', () => setup(), 'fb_plaintext'],
    ['revoked key', () => setup({ revoked: true }), null],
  ])('rejects %s', async (_name, makeSetup, replacement) => {
    const { request, strategy, token } = makeSetup();
    await expect(
      resolveMcpAccess({
        authenticate: strategy.authenticate,
        pluginOptions,
        req: request(replacement ?? token),
      }),
    ).rejects.toThrow(UnauthorizedError);
  });
});

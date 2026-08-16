import { apiKeysPlugin, createApiKeyToken, hashApiKeyToken } from '@frogbotai/plugin-api-keys';
import { rolesPlugin } from '@frogbotai/plugin-roles';
import type { FrogbotConfig } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import { buildConfig } from '../../../frogbot/src/config/build.js';
import { mcpPlugin } from './index.js';

const baseConfig = {
  collections: [{ slug: 'users', auth: true, fields: [] }],
} as FrogbotConfig;

const authenticatedConfig = () => apiKeysPlugin()(baseConfig);

describe('MCP plugin', () => {
  it.each([
    ['collection', { collections: { auth: { enabled: true } } }, 'auth'],
    ['collection', { collections: { config: { enabled: true } } }, 'config'],
    ['collection', { collections: { jobs: { enabled: true } } }, 'jobs'],
    ['global', { globals: { auth: { enabled: true } } }, 'auth'],
    ['global', { globals: { config: { enabled: true } } }, 'config'],
    ['global', { globals: { jobs: { enabled: true } } }, 'jobs'],
  ])('rejects reserved %s capability slugs', (type, options, capability) => {
    expect(() => mcpPlugin(options as never)).toThrow(
      `[plugin-mcp] ${type === 'collection' ? 'Collection' : 'Global'} slug '${capability}' maps to reserved MCP capability '${capability}'.`,
    );
  });

  it('requires the API key authentication strategy', async () => {
    await expect(mcpPlugin({})(baseConfig)).rejects.toThrow(
      '[plugin-mcp] apiKeysPlugin must be configured before mcpPlugin.',
    );
  });

  it('rejects an unrelated strategy with the same name', async () => {
    const config = {
      ...baseConfig,
      collections: [
        {
          slug: 'users',
          auth: {
            strategies: [
              { name: 'api-key', authenticate: async () => ({ user: { id: 'fake' } as never }) },
            ],
          },
          fields: [],
        },
      ],
    } as FrogbotConfig;

    await expect(mcpPlugin({})(config)).rejects.toThrow(
      '[plugin-mcp] apiKeysPlugin must be configured before mcpPlugin.',
    );
  });

  it('registers Payload MCP endpoints and its dormant key collection', async () => {
    const result = await mcpPlugin({ collections: { posts: { enabled: true } } })(
      await authenticatedConfig(),
    );

    expect(result.collections.map(({ slug }) => slug)).toContain('payload-mcp-api-keys');
    expect(
      result.endpoints?.filter(({ path }) => path === '/mcp').map(({ method }) => method),
    ).toEqual(['post', 'get']);
  });

  it('does not register experimental tools or call Payload default auth', async () => {
    const result = await mcpPlugin({
      experimental: { tools: { auth: { enabled: true } } },
    } as never)(await authenticatedConfig());
    const endpoint = result.endpoints?.find(
      ({ method, path }) => method === 'post' && path === '/mcp',
    );
    const payload = { find: vi.fn() };

    await expect(
      endpoint?.handler({ headers: new Headers(), payload, user: null } as never),
    ).rejects.toThrow('Unauthorized');
    expect(payload.find).not.toHaveBeenCalled();
    expect(
      result.collections.find(({ slug }) => slug === 'payload-mcp-api-keys'),
    ).not.toHaveProperty(
      'fields',
      expect.arrayContaining([expect.objectContaining({ name: 'auth' })]),
    );
  });

  it.each([
    ['invalid key', 'fb_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    ['plaintext lookalike', 'fb_plaintext'],
    ['revoked key', createApiKeyToken()],
  ])('rejects %s before MCP handling', async (_name, token) => {
    const result = await mcpPlugin({ collections: { posts: { enabled: { find: true } } } })(
      await authenticatedConfig(),
    );
    const endpoint = result.endpoints?.find(
      ({ method, path }) => method === 'post' && path === '/mcp',
    );
    const payload = { find: vi.fn().mockResolvedValue({ docs: [] }) };

    await expect(
      endpoint?.handler({
        headers: new Headers({ authorization: `Bearer ${token}` }),
        payload,
      } as never),
    ).rejects.toThrow('Unauthorized');
  });

  it('registers MCP through the FrogBot config pipeline', async () => {
    const config = await buildConfig({
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as never,
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'posts', fields: [{ name: 'title', type: 'text' }] },
      ],
      plugins: [
        rolesPlugin(),
        apiKeysPlugin(),
        mcpPlugin({ collections: { posts: { enabled: { find: true } } } }),
      ],
    } as FrogbotConfig);
    const payloadConfig = await config._internal.payloadConfig;

    expect(payloadConfig.endpoints?.filter(({ path }) => path === '/mcp')).toHaveLength(2);
    expect(payloadConfig.collections.map(({ slug }) => slug)).toContain('payload-mcp-api-keys');
    expect(payloadConfig).not.toHaveProperty('plugins');
  });

  it('lists and invokes configured CRUD tools with a valid hashed key', async () => {
    const token = createApiKeyToken();
    const config = await buildConfig({
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as never,
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'posts', fields: [{ name: 'title', type: 'text' }] },
      ],
      plugins: [
        rolesPlugin(),
        apiKeysPlugin(),
        mcpPlugin({ collections: { posts: { enabled: { find: true } } } }),
      ],
    } as FrogbotConfig);
    const payloadConfig = await config._internal.payloadConfig;
    const endpoint = payloadConfig.endpoints?.find(
      ({ method, path }) => method === 'post' && path === '/mcp',
    );
    const payload = {
      config: payloadConfig,
      db: { defaultIDType: 'number' },
      secret: 'test-secret',
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
      find: vi.fn().mockImplementation(({ collection, where }) => {
        if (collection === 'api-keys') {
          return Promise.resolve({
            docs:
              where.and[0].tokenHash.equals === hashApiKeyToken(token)
                ? [{ id: 'key-1', owner: 'user-1' }]
                : [],
          });
        }
        if (collection === 'posts') {
          return Promise.resolve({ docs: [{ id: 1, title: 'First post' }], totalDocs: 1 });
        }
        return Promise.resolve({ docs: [] });
      }),
      findByID: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
      update: vi.fn().mockResolvedValue({}),
    };
    const request = async (body: Record<string, unknown>) => {
      const response = await endpoint?.handler({
        body: JSON.stringify(body),
        headers: new Headers({
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        }),
        i18n: { t: (value: string) => value },
        method: 'POST',
        payload,
        url: 'http://localhost/api/mcp',
      } as never);
      const text = (await response?.text()) ?? '';
      const data =
        text
          .split('\n')
          .find((line) => line.startsWith('data: '))
          ?.slice(6) ?? text;
      return JSON.parse(data) as Record<string, any>;
    };

    const listed = await request({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    expect(listed.result.tools.map(({ name }: { name: string }) => name)).toEqual(['findPosts']);

    const called = await request({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'findPosts', arguments: {} },
    });
    expect(called.result.content[0].text).toContain('First post');
    expect(payload.find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'posts' }));
  });
});

import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { rolesPlugin } from '@frogbotai/plugin-roles';
import type { FrogBotConfig } from 'frogbot';
import { describe, expect, it } from 'vitest';

import { buildConfig } from '../../../packages/frogbot/src/config/build.js';
import { mcpPlugin } from '../../../packages/plugins/plugin-mcp/src/index.js';

type BuildConfigInput = Parameters<typeof buildConfig>[0];

function frogbotConfig(fields: Partial<FrogBotConfig>): FrogBotConfig {
  return fields as FrogBotConfig;
}

const baseConfig = frogbotConfig({
  collections: [{ slug: 'users', auth: true, fields: [] }],
});

const authenticatedConfig = () => apiKeysPlugin()(baseConfig);

describe('MCP plugin', () => {
  it('requires the API key authentication strategy', () => {
    expect(() => mcpPlugin({})(baseConfig)).toThrow(
      '[plugin-mcp] apiKeysPlugin must be configured before mcpPlugin.',
    );
  });

  it('rejects an unrelated strategy with the same name', () => {
    const config = {
      ...baseConfig,
      collections: [
        {
          slug: 'users',
          auth: {
            strategies: [
              {
                name: 'api-key',
                authenticate: () => Promise.resolve({ user: { id: 'fake' } as never }),
              },
            ],
          },
          fields: [],
        },
      ],
    } as FrogBotConfig;

    expect(() => mcpPlugin({})(config)).toThrow(
      '[plugin-mcp] apiKeysPlugin must be configured before mcpPlugin.',
    );
  });

  it("hands Payload's MCP plugin to Payload's build", async () => {
    const result = await mcpPlugin({ collections: { posts: { description: 'Posts' } } })(
      await authenticatedConfig(),
    );

    expect(result._payloadPlugins?.map(({ slug }) => slug)).toEqual(['@payloadcms/plugin-mcp']);
    expect(result.endpoints ?? []).toEqual([]);
  });

  it('registers MCP through the FrogBot config pipeline', async () => {
    const config = await buildConfig({
      secret: 'test-secret',
      db: { defaultIDType: 'number' } as never,
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'posts', fields: [{ name: 'title', type: 'text' }] },
      ],
      plugins: [rolesPlugin(), apiKeysPlugin(), mcpPlugin()],
    } as BuildConfigInput);

    const payloadConfig = await config._internal.payloadConfig;

    expect(
      payloadConfig.endpoints?.filter(({ path }) => path === '/mcp').map(({ method }) => method),
    ).toEqual(['post', 'get']);
    expect(payloadConfig.plugins?.map(({ slug }) => slug)).toEqual(['@payloadcms/plugin-mcp']);
  });
});

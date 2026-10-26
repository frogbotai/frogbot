import { isApiKeyStrategy } from '@frogbotai/plugin-api-keys';
import type { MCPPluginConfig } from '@payloadcms/plugin-mcp';
import { mcpPlugin as payloadMcpPlugin } from '@payloadcms/plugin-mcp';
import type { Plugin } from 'frogbot';

import { authorizeMcp } from './access.js';
import type { AUTH_TOOLS, COLLECTION_TOOLS, McpTool } from './tools.js';
import { toPayloadTools } from './tools.js';

export type { McpTool } from './tools.js';
export { definePrompt } from '@payloadcms/plugin-mcp';

type PayloadCollectionOptions = NonNullable<NonNullable<MCPPluginConfig['collections']>[string]>;

type PayloadCollectionTools = NonNullable<PayloadCollectionOptions['tools']>;

export type McpCollectionOptions = Omit<PayloadCollectionOptions, 'tools'> & {
  /** Turn off or reword Payload's built-in tools for this collection, or opt in to its auth tools. */
  tools?: {
    [K in keyof typeof COLLECTION_TOOLS | keyof typeof AUTH_TOOLS]?: PayloadCollectionTools[K];
  };
};

export type McpPluginOptions = Pick<
  MCPPluginConfig,
  'disabled' | 'hooks' | 'mcp' | 'prompts' | 'resources'
> & {
  collections?: Record<string, McpCollectionOptions>;
  /** FrogBot tools, piece actions and piece instances to serve, each named by its slug. */
  tools?: readonly McpTool[];
};

export function mcpPlugin(options: McpPluginOptions = {}): Plugin {
  const { tools = [], ...rest } = options;
  const payloadTools = toPayloadTools(tools);

  return (config) => {
    const apiKeyStrategy = config.collections
      .flatMap((collection) => {
        const auth = typeof collection.auth === 'object' ? collection.auth : undefined;

        return (auth?.strategies ?? []).map((strategy) => ({
          collection: collection.slug,
          strategy,
        }));
      })
      .find(({ strategy }) => isApiKeyStrategy(strategy));

    if (!apiKeyStrategy) {
      throw new Error('[plugin-mcp] apiKeysPlugin must be configured before mcpPlugin.');
    }

    return {
      ...config,
      _payloadPlugins: [
        ...(config._payloadPlugins ?? []),
        payloadMcpPlugin({
          ...rest,
          tools: payloadTools,
          overrideGetAuthorizedMCP: ({ pluginConfig, req }) =>
            authorizeMcp({
              collection: apiKeyStrategy.collection,
              strategy: apiKeyStrategy.strategy,
              pluginConfig,
              req,
            }),
        }),
      ],
    };
  };
}

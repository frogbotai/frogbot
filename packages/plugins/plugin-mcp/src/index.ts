import { isApiKeyStrategy } from '@frogbotai/plugin-api-keys';
import type { MCPPluginConfig } from '@payloadcms/plugin-mcp';
import { mcpPlugin as payloadMcpPlugin } from '@payloadcms/plugin-mcp';
import type { Plugin } from 'frogbot';

import { authorizeMcp } from './access.js';

export {
  defineCollectionTool,
  defineGlobalTool,
  definePrompt,
  defineTool,
} from '@payloadcms/plugin-mcp';

export type McpPluginOptions = Omit<MCPPluginConfig, 'overrideGetAuthorizedMCP'>;

export function mcpPlugin(options: McpPluginOptions = {}): Plugin {
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
          ...options,
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

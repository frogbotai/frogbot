import { isApiKeyStrategy } from '@frogbotai/plugin-api-keys';
import type { MCPPluginConfig } from '@payloadcms/plugin-mcp';
import { mcpPlugin as payloadMcpPlugin } from '@payloadcms/plugin-mcp';
import type { Plugin } from 'frogbot';

import { resolveMcpAccess, validateMcpCapabilities } from './access.js';

export type McpPluginOptions = Omit<MCPPluginConfig, 'experimental' | 'overrideAuth'>;

export function mcpPlugin(pluginOptions: McpPluginOptions = {}): Plugin {
  validateMcpCapabilities(pluginOptions);
  return async (config) => {
    const apiKeyStrategy = config.collections
      .flatMap((collection) => {
        const auth = typeof collection.auth === 'object' ? collection.auth : undefined;
        return auth?.strategies ?? [];
      })
      .find(isApiKeyStrategy);
    if (!apiKeyStrategy) {
      throw new Error('[plugin-mcp] apiKeysPlugin must be configured before mcpPlugin.');
    }

    const {
      experimental: _experimental,
      overrideAuth: _overrideAuth,
      ...options
    } = pluginOptions as MCPPluginConfig;
    return (await payloadMcpPlugin({
      ...options,
      overrideAuth: (req) =>
        resolveMcpAccess({
          authenticate: apiKeyStrategy.authenticate,
          pluginOptions: options,
          req,
        }),
    })(config as never)) as unknown as typeof config;
  };
}

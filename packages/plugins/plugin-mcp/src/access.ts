import type { ApiKeyStrategy } from '@frogbotai/plugin-api-keys';
import type { MCPAccessSettings } from '@payloadcms/plugin-mcp';
import type { MCPPluginConfig } from '@payloadcms/plugin-mcp';
import type { PayloadRequest } from 'payload';
import { UnauthorizedError } from 'payload';

type ResolveMcpAccessOptions = {
  authenticate: ApiKeyStrategy['authenticate'];
  pluginOptions: MCPPluginConfig;
  req: PayloadRequest;
};

const toCamelCase = (value: string) => value
  .replace(/[-_\s]+(.)?/g, (_, character: string | undefined) => character?.toUpperCase() ?? '')
  .replace(/^(.)/, (_, character: string) => character.toLowerCase());

export function validateMcpCapabilities(pluginOptions: MCPPluginConfig): void {
  const reserved = new Set(['auth', 'config', 'jobs']);
  for (const [type, entities] of [
    ['Collection', pluginOptions.collections],
    ['Global', pluginOptions.globals],
  ] as const) {
    for (const slug of Object.keys(entities ?? {})) {
      const capability = toCamelCase(slug);
      if (reserved.has(capability)) {
        throw new Error(`[plugin-mcp] ${type} slug '${slug}' maps to reserved MCP capability '${capability}'.`);
      }
    }
  }
}

function collectionGrants(options: MCPPluginConfig['collections']) {
  return Object.fromEntries(Object.entries(options ?? {}).map(([slug, config]) => [
    toCamelCase(slug),
    config?.enabled === true ? { create: true, delete: true, find: true, update: true } : config?.enabled,
  ]));
}

function globalGrants(options: MCPPluginConfig['globals']) {
  return Object.fromEntries(Object.entries(options ?? {}).map(([slug, config]) => [
    toCamelCase(slug),
    config?.enabled === true ? { find: true, update: true } : config?.enabled,
  ]));
}

function namedGrants(items: Array<{ name: string }> | undefined) {
  return Object.fromEntries((items ?? []).map(({ name }) => [toCamelCase(name), true]));
}

export async function resolveMcpAccess({ authenticate, pluginOptions, req }: ResolveMcpAccessOptions): Promise<MCPAccessSettings> {
  const result = await authenticate({ headers: req.headers, payload: req.payload });
  if (!result.user) throw new UnauthorizedError();

  return {
    user: result.user,
    ...collectionGrants(pluginOptions.collections),
    ...globalGrants(pluginOptions.globals),
    'payload-mcp-tool': namedGrants(pluginOptions.mcp?.tools),
    'payload-mcp-prompt': namedGrants(pluginOptions.mcp?.prompts),
    'payload-mcp-resource': namedGrants(pluginOptions.mcp?.resources),
    auth: {
      auth: false,
      forgotPassword: false,
      login: false,
      resetPassword: false,
      unlock: false,
      verify: false,
    },
    config: { find: false, update: false },
    jobs: { create: false, run: false, update: false },
  };
}

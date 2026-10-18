import { isRecord } from '../utilities/isRecord.js';
import type { MCPServer, MCPServerOptions } from './types.js';

export const mcpServerMarker = '~mcpServer';

const NAME = /^[A-Za-z0-9_-]+$/;

const MAX_TIMEOUT = 2 ** 31 - 1;

/** Declares an MCP server whose tools an agent can call. Put it in root or agent `tools`. */
export function mcpServer(options: MCPServerOptions): MCPServer {
  return Object.freeze({ ...options, [mcpServerMarker]: true });
}

export function isMCPServer(value: unknown): value is MCPServer {
  return isRecord(value) && value[mcpServerMarker] === true;
}

export function sanitizeMCPServers(tools: readonly unknown[], contextLabel: string): MCPServer[] {
  const context = `${contextLabel[0].toLowerCase()}${contextLabel.slice(1)}`;
  const names = new Set<string>();

  return tools.filter(isMCPServer).map((server) => {
    const { name } = server as { name: unknown };

    if (typeof name !== 'string' || !NAME.test(name)) {
      throw new Error(
        `[frogbot] MCP server name '${String(name)}' in ${context} may only use letters, digits, '_' and '-'.`,
      );
    }

    if (names.has(name)) {
      throw new Error(`[frogbot] Duplicate MCP server '${name}' in ${context}.`);
    }

    names.add(name);

    const label = `MCP server '${name}' in ${context}`;

    if (server.type === 'local') {
      if (
        !Array.isArray(server.command) ||
        server.command.length === 0 ||
        server.command.some((part) => typeof part !== 'string' || !part)
      ) {
        throw new Error(`[frogbot] ${label} requires a \`command\` array.`);
      }

      if (server.cwd !== undefined && typeof server.cwd !== 'string') {
        throw new Error(`[frogbot] ${label} \`cwd\` must be a string.`);
      }

      assertStrings(server.environment, `${label} \`environment\``);
    } else if (server.type === 'remote') {
      if (typeof server.url !== 'string' || !URL.canParse(server.url)) {
        throw new Error(`[frogbot] ${label} requires a \`url\`.`);
      }

      assertStrings(server.headers, `${label} \`headers\``);
    } else {
      throw new Error(`[frogbot] ${label} \`type\` must be 'local' or 'remote'.`);
    }

    if (server.timeout !== undefined) {
      if (!isRecord(server.timeout)) {
        throw new Error(`[frogbot] ${label} \`timeout\` must be an object.`);
      }

      for (const [key, value] of Object.entries(server.timeout)) {
        if (!['startup', 'catalog', 'execution'].includes(key)) {
          throw new Error(
            `[frogbot] ${label} \`timeout\` takes only startup, catalog and execution.`,
          );
        }

        if (
          value !== undefined &&
          (typeof value !== 'number' || !(value > 0) || value > MAX_TIMEOUT)
        ) {
          throw new Error(`[frogbot] ${label} \`timeout.${key}\` must be a positive number of ms.`);
        }
      }
    }

    return server;
  });
}

function assertStrings(value: unknown, label: string) {
  if (value === undefined) return;

  if (!isRecord(value)) throw new Error(`[frogbot] ${label} must map names to strings.`);

  const bad = Object.keys(value).find((key) => typeof value[key] !== 'string');

  if (bad !== undefined) {
    throw new Error(
      `[frogbot] ${label} must map names to strings; '${bad}' is ${typeof value[bad]}.`,
    );
  }
}

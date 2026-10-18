import type { ListToolsResult, MCPClient } from '@ai-sdk/mcp';
import type { JSONValue, Tool, ToolExecutionOptions, ToolSet, UIMessage } from 'ai';
import { dynamicTool, jsonSchema } from 'ai';

import type { Logger } from '../frogbot.js';
import { isRecord } from '../utilities/isRecord.js';
import type { MCPConnections } from './connections.js';
import { errorMessage } from './connections.js';
import type { MCPServer } from './types.js';

export const DEFAULT_CATALOG_TIMEOUT = 30_000;
export const DEFAULT_EXECUTION_TIMEOUT = 12 * 60 * 60 * 1000;

/** OpenCode's rule: `<server>_<tool>`, with anything outside `[A-Za-z0-9_-]` as `_`. */
export function mcpToolName(server: string, tool: string): string {
  return `${server}_${tool.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

export type ResolveMCPToolsProps = {
  agent: string;
  servers: readonly MCPServer[];
  connections: MCPConnections;
  /** Names already taken by the agent's configured tools. */
  reserved: ReadonlySet<string>;
  abortSignal?: AbortSignal;
  logger: Pick<Logger, 'warn'>;
};

/** Lists each server's tools for one run. A server that fails is left out with a warning. */
export async function resolveMCPTools({
  agent,
  servers,
  connections,
  reserved,
  abortSignal,
  logger,
}: ResolveMCPToolsProps): Promise<ToolSet> {
  const catalogs = await Promise.all(
    servers.map(async (server) => {
      try {
        const client = await untilAborted(connections.get(agent, server), abortSignal);

        try {
          return {
            server,
            tools: client.toolsFromDefinitions(await listAll(client, server, abortSignal)),
          };
        } catch (error) {
          if (!abortSignal?.aborted) await connections.discard(agent, server, client);

          throw error;
        }
      } catch (error) {
        if (!abortSignal?.aborted) {
          logger.warn(
            `[frogbot] MCP server '${server.name}' for agent '${agent}' is unavailable: ${errorMessage(error)}`,
          );
        }

        return { server, tools: {} as ToolSet };
      }
    }),
  );

  const tools: ToolSet = {};

  for (const { server, tools: listed } of catalogs) {
    const execution = server.timeout?.execution ?? DEFAULT_EXECUTION_TIMEOUT;

    for (const [toolName, tool] of Object.entries(listed)) {
      const name = mcpToolName(server.name, toolName);

      if (reserved.has(name) || Object.hasOwn(tools, name)) {
        connections.warnOnce(
          `${agent}\0${name}`,
          `[frogbot] Agent '${agent}' leaves out MCP tool '${toolName}' from '${server.name}': the name '${name}' is already taken.`,
        );

        continue;
      }

      const execute = tool.execute!;

      tools[name] = {
        ...tool,
        description: tool.description ?? '',
        execute: (input: unknown, options: ToolExecutionOptions<never>) =>
          execute(input, {
            ...options,
            abortSignal: AbortSignal.any([
              ...(options.abortSignal ? [options.abortSignal] : []),
              AbortSignal.timeout(execution),
            ]),
          }),
      } as Tool;
    }
  }

  return tools;
}

async function listAll(
  client: MCPClient,
  server: MCPServer,
  abortSignal: AbortSignal | undefined,
): Promise<ListToolsResult> {
  const timeout = server.timeout?.catalog ?? DEFAULT_CATALOG_TIMEOUT;
  const timer = AbortSignal.timeout(timeout);
  const signal = abortSignal ? AbortSignal.any([timer, abortSignal]) : timer;

  try {
    let page = await client.listTools({ options: { signal } });
    const tools = [...page.tools];

    while (page.nextCursor != null) {
      page = await client.listTools({ params: { cursor: page.nextCursor }, options: { signal } });

      tools.push(...page.tools);
    }

    return { ...page, tools };
  } catch (error) {
    if (timer.aborted) throw new Error(`listing tools timed out after ${timeout}ms`);

    throw error;
  }
}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;

  signal.throwIfAborted();

  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason as Error);

    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/**
 * Tools for replaying stored MCP results whose tool isn't listed for this run, so an earlier
 * screenshot goes back to the model as an image, not as base64 JSON.
 */
export function mcpReplayTools(messages: readonly UIMessage[]): ToolSet {
  const tools: ToolSet = {};

  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type === 'dynamic-tool' &&
        part.state === 'output-available' &&
        isCallToolResult(part.output)
      ) {
        tools[part.toolName] ??= replayTool;
      }
    }
  }

  return tools;
}

const replayTool = dynamicTool({
  inputSchema: jsonSchema({ type: 'object' }),
  execute: () => {
    throw new Error('This MCP tool is not available in this run.');
  },
  toModelOutput: ({ output }) => mcpToModelOutput(output),
});

function isCallToolResult(output: unknown): output is { content: unknown[] } {
  return isRecord(output) && Array.isArray(output.content);
}

function mcpToModelOutput(output: unknown) {
  if (!isCallToolResult(output)) return { type: 'json' as const, value: output as JSONValue };

  return {
    type: 'content' as const,
    value: output.content.map((part) => {
      if (isRecord(part) && part.type === 'text' && typeof part.text === 'string') {
        return { type: 'text' as const, text: part.text };
      }

      if (
        isRecord(part) &&
        part.type === 'image' &&
        typeof part.data === 'string' &&
        typeof part.mimeType === 'string'
      ) {
        return {
          type: 'file' as const,
          mediaType: part.mimeType,
          data: { type: 'data' as const, data: part.data },
        };
      }

      return { type: 'text' as const, text: JSON.stringify(part) };
    }),
  };
}

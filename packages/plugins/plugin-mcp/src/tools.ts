import { randomUUID } from 'node:crypto';

import type { MCPPluginConfig } from '@payloadcms/plugin-mcp';
import type { PieceAction, PieceInstance } from 'frogbot';
import type { AnyTool } from 'frogbot/internal';
import { attachRegisteredFrogBot, isClientTool, sanitizeToolList } from 'frogbot/internal';

type PayloadTool = NonNullable<MCPPluginConfig['tools']>[string];

type PayloadToolResponse = Awaited<ReturnType<PayloadTool['handler']>>;

export type McpTool = AnyTool | PieceAction | PieceInstance;

/** Payload's built-in collection tools: config key → MCP wire name. */
export const COLLECTION_TOOLS = {
  count: 'countDocuments',
  countVersions: 'countVersions',
  create: 'createDocuments',
  delete: 'deleteDocuments',
  duplicate: 'duplicateDocument',
  find: 'findDocuments',
  findDistinct: 'findDistinct',
  findVersionByID: 'findVersionByID',
  findVersions: 'findVersions',
  getCollectionSchema: 'getCollectionSchema',
  getUploadInstructions: 'getUploadInstructions',
  restoreVersion: 'restoreVersion',
  update: 'updateDocument',
} as const;

/** Payload's opt-in auth collection tools: config key → MCP wire name. */
export const AUTH_TOOLS = {
  auth: 'auth',
  forgotPassword: 'forgotPassword',
  login: 'login',
  resetPassword: 'resetPassword',
  unlock: 'unlock',
  verify: 'verify',
} as const;

/** MCP names Payload's plugin registers itself. Payload doesn't export them. */
export const RESERVED_TOOL_NAMES: ReadonlySet<string> = new Set([
  'getConfigInfo',
  ...Object.values(COLLECTION_TOOLS),
  ...Object.values(AUTH_TOOLS),
]);

export function toPayloadTools(tools: readonly McpTool[]): Record<string, PayloadTool> {
  let sanitized: AnyTool[];

  try {
    sanitized = sanitizeToolList(tools, 'mcpPlugin tools');
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message.replace(/^\[frogbot\]/, '[plugin-mcp]'), { cause: error });
    }

    throw error;
  }

  const payloadTools: Record<string, PayloadTool> = {};

  for (const tool of sanitized) {
    if (isClientTool(tool)) {
      throw new Error(
        `[plugin-mcp] Tool '${tool.slug}' is a client tool, which can't run over MCP.`,
      );
    }

    if (RESERVED_TOOL_NAMES.has(tool.slug)) {
      throw new Error(
        `[plugin-mcp] Tool '${tool.slug}' has the name of a built-in Payload MCP tool.`,
      );
    }

    assertListableSchema(tool.slug, tool.inputSchema);

    const { execute } = tool;

    payloadTools[tool.slug] = {
      description: tool.description,
      input: tool.inputSchema,
      handler: async ({ input, req }) => {
        try {
          const frogbotReq = attachRegisteredFrogBot(req);
          const result: unknown = await execute(input, {
            req: frogbotReq,
            frogbot: frogbotReq.frogbot,
            agent: { slug: 'mcp', runId: randomUUID() },
          });

          return toResponse(result);
        } catch (error) {
          return {
            content: [
              { type: 'text', text: error instanceof Error ? error.message : String(error) },
            ],
            isError: true,
          };
        }
      },
    };
  }

  return payloadTools;
}

type JsonSchemaSource = {
  '~standard': {
    jsonSchema?: { input: (options: { target: 'draft-2020-12' }) => { type?: unknown } };
  };
};

function assertListableSchema(slug: string, schema: JsonSchemaSource): void {
  let type: unknown;

  try {
    type = schema['~standard'].jsonSchema?.input({ target: 'draft-2020-12' }).type;
  } catch (error) {
    throw new Error(
      `[plugin-mcp] Tool '${slug}' has an input schema MCP can't describe as JSON Schema: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }

  if (type !== undefined && type !== 'object') {
    throw new Error(
      `[plugin-mcp] Tool '${slug}' needs an object input schema, like z.object({...}).`,
    );
  }
}

function toResponse(result: unknown): PayloadToolResponse {
  if (typeof result === 'string') return { content: [{ type: 'text', text: result }] };

  const text = JSON.stringify(result ?? null) ?? 'null';
  const json: unknown = JSON.parse(text);

  if (typeof json === 'object' && json !== null && !Array.isArray(json)) {
    return {
      content: [{ type: 'text', text }],
      structuredContent: Object.fromEntries(Object.entries(json)),
    };
  }

  return { content: [{ type: 'text', text }] };
}

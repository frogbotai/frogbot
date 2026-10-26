import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { rolesPlugin } from '@frogbotai/plugin-roles';
import type { FrogBotConfig, Tool, ToolCtx } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { buildConfig } from '../../../packages/frogbot/src/config/build.js';
import { question } from '../../../packages/frogbot/src/tools/question.js';
import { createMathHelper } from '../../../packages/pieces/piece-math-helper/src/index.js';
import { mcpPlugin } from '../../../packages/plugins/plugin-mcp/src/index.js';
import { toPayloadTools } from '../../../packages/plugins/plugin-mcp/src/tools.js';

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

const echo: Tool<z.ZodObject<{ text: z.ZodString }>> = {
  slug: 'echo',
  description: 'Echo the input.',
  inputSchema: z.object({ text: z.string() }),
  execute: vi.fn((input: { text: string }) => input.text),
};

function returning(slug: string, value: unknown): Tool {
  return { slug, description: `Return ${slug}.`, inputSchema: z.object({}), execute: () => value };
}

function call(tool: { handler: (args: never) => unknown }, input: unknown = {}) {
  const frogbot = { config: {} };
  const req = { payload: {}, frogbot };
  const result = tool.handler({ input, req } as never);

  return { frogbot, req, result: Promise.resolve(result) };
}

describe('MCP plugin tools', () => {
  it("passes each tool's slug, description and input schema to Payload", async () => {
    const result = await mcpPlugin({ tools: [echo] })(await authenticatedConfig());
    const options = result._payloadPlugins?.[0]?.options;

    expect(options?.tools).toEqual({
      echo: {
        description: 'Echo the input.',
        input: echo.inputSchema,
        handler: expect.any(Function),
      },
    });
  });

  it('runs execute with the request, its FrogBot and an mcp agent', async () => {
    const { echo: tool } = toPayloadTools([echo]);
    const { frogbot, req, result } = call(tool, { text: 'hi' });

    await expect(result).resolves.toEqual({ content: [{ type: 'text', text: 'hi' }] });
    expect(echo.execute).toHaveBeenCalledWith(
      { text: 'hi' },
      { req, frogbot, agent: { slug: 'mcp', runId: expect.any(String) } },
    );
    expect(vi.mocked(echo.execute).mock.calls[0]?.[1].agent).not.toHaveProperty('chatId');
  });

  it('gives each call its own run id', async () => {
    const execute = vi.fn((_input: unknown, ctx: ToolCtx) => ctx.agent.runId);
    const { run } = toPayloadTools([{ ...returning('run', null), execute }]);

    await call(run).result;
    await call(run).result;

    expect(execute.mock.calls[0]?.[1].agent.runId).not.toBe(execute.mock.calls[1]?.[1].agent.runId);
  });

  it('maps objects, arrays and nothing to JSON text, and objects also to structured content', async () => {
    const tools = toPayloadTools([
      returning('object', { id: 1, tags: ['a'] }),
      returning('array', [1, 2]),
      returning('nothing', undefined),
    ]);

    await expect(call(tools.object).result).resolves.toEqual({
      content: [{ type: 'text', text: '{"id":1,"tags":["a"]}' }],
      structuredContent: { id: 1, tags: ['a'] },
    });
    await expect(call(tools.array).result).resolves.toEqual({
      content: [{ type: 'text', text: '[1,2]' }],
    });
    await expect(call(tools.nothing).result).resolves.toEqual({
      content: [{ type: 'text', text: 'null' }],
    });
  });

  it('sends structured content only when the JSON text is an object', async () => {
    const tools = toPayloadTools([
      returning('date', new Date('2026-10-26T00:00:00.000Z')),
      returning('custom', { toJSON: () => ({ id: 7 }) }),
      returning('fn', () => 1),
    ]);

    await expect(call(tools.date).result).resolves.toEqual({
      content: [{ type: 'text', text: '"2026-10-26T00:00:00.000Z"' }],
    });
    await expect(call(tools.custom).result).resolves.toEqual({
      content: [{ type: 'text', text: '{"id":7}' }],
      structuredContent: { id: 7 },
    });
    await expect(call(tools.fn).result).resolves.toEqual({
      content: [{ type: 'text', text: 'null' }],
    });
  });

  it('returns a thrown error as an MCP error result', async () => {
    const { fails } = toPayloadTools([
      {
        ...returning('fails', null),
        execute: () => Promise.reject(new Error('No ticket 42.')),
      },
    ]);

    await expect(call(fails).result).resolves.toEqual({
      content: [{ type: 'text', text: 'No ticket 42.' }],
      isError: true,
    });
  });

  it('expands a piece instance into one tool per action', () => {
    const math = createMathHelper();

    expect(Object.keys(toPayloadTools([math]))).toEqual([
      'mathHelper_addNumbers',
      'mathHelper_subtractNumbers',
      'mathHelper_multiplyNumbers',
      'mathHelper_divideNumbers',
      'mathHelper_getRemainder',
      'mathHelper_generateRandomNumber',
    ]);
    expect(Object.keys(toPayloadTools([math.addNumbers]))).toEqual(['mathHelper_addNumbers']);
  });

  it('accepts a union of object input schemas', () => {
    const inputSchema = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('a') }),
      z.object({ kind: z.literal('b') }),
    ]);

    expect(Object.keys(toPayloadTools([{ ...returning('pick', null), inputSchema }]))).toEqual([
      'pick',
    ]);
  });

  it.each([
    {
      name: 'a client tool',
      tools: [question],
      message: "[plugin-mcp] Tool 'question' is a client tool, which can't run over MCP.",
    },
    {
      name: 'getConfigInfo',
      tools: [returning('getConfigInfo', null)],
      message: "[plugin-mcp] Tool 'getConfigInfo' has the name of a built-in Payload MCP tool.",
    },
    {
      name: 'findDocuments',
      tools: [returning('findDocuments', null)],
      message: "[plugin-mcp] Tool 'findDocuments' has the name of a built-in Payload MCP tool.",
    },
    {
      name: 'a duplicate slug',
      tools: [echo, echo],
      message: "[plugin-mcp] Duplicate tool slug 'echo' in mcpPlugin tools.",
    },
    {
      name: 'an input schema JSON Schema cannot describe',
      tools: [{ ...returning('schedule', null), inputSchema: z.object({ when: z.date() }) }],
      message:
        "[plugin-mcp] Tool 'schedule' has an input schema MCP can't describe as JSON Schema: Date cannot be represented in JSON Schema",
    },
    {
      name: 'a non-object input schema',
      tools: [{ ...returning('shout', null), inputSchema: z.string() }],
      message: "[plugin-mcp] Tool 'shout' needs an object input schema, like z.object({...}).",
    },
  ])('refuses $name when the plugin is created', ({ tools, message }) => {
    expect(() => mcpPlugin({ tools })).toThrow(message);
  });
});

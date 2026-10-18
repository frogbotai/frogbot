import type { LanguageModelV4CallOptions, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import type { UIMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAgentInstance } from '../../../../packages/frogbot/src/agents/instance.js';
import type { AgentModelId } from '../../../../packages/frogbot/src/agents/types.js';
import { MCPConnections } from '../../../../packages/frogbot/src/mcp/connections.js';
import type { MCPServer } from '../../../../packages/frogbot/src/mcp/types.js';
import { question } from '../../../../packages/frogbot/src/tools/question.js';
import type { AnyTool } from '../../../../packages/frogbot/src/tools/types.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';
import { type Scratch, scratch } from './fixture.js';

const ai = { providers: { openai: { apiKey: 'test' } }, routers: {} };

const MODEL = 'openai/test' as AgentModelId;

const usage = {
  inputTokens: { total: 2, noCache: 2, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

let fixture: Scratch;
let connections: MCPConnections;
const logger = { warn: vi.fn(), error: vi.fn() };

beforeEach(async () => {
  fixture = await scratch();
  logger.warn.mockReset();
  connections = new MCPConnections(logger);
});

afterEach(async () => {
  await connections.closeAll();
  await fixture.cleanup();
});

function stream(parts: LanguageModelV4StreamPart[]) {
  return {
    stream: new ReadableStream<LanguageModelV4StreamPart>({
      start(controller) {
        for (const part of parts) controller.enqueue(part);

        controller.close();
      },
    }),
  };
}

function reply(text: string): LanguageModelV4StreamPart[] {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: text },
    { type: 'text-end', id: 'text-1' },
    { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
  ];
}

function callTool(toolName: string): LanguageModelV4StreamPart[] {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'tool-call', toolCallId: 'call-1', toolName, input: '{}' },
    { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage },
  ];
}

function setup({
  mcp,
  tools,
  steps = [reply('Done')],
}: {
  mcp: MCPServer[];
  tools?: AnyTool[];
  steps?: LanguageModelV4StreamPart[][];
}) {
  let step = 0;
  const model = new MockLanguageModelV4({
    modelId: 'test',
    doStream: () => Promise.resolve(stream(steps[Math.min(step++, steps.length - 1)])),
  });

  const frogbot = {
    config: {
      ai,
      chat: { enabled: true, assetsSlug: 'frogbot-chat-assets' },
    },
    createRequest: (req: Partial<FrogBotRequest> = {}) =>
      Promise.resolve({ user: { id: 'user-1' }, payload: { db: {} }, ...req, frogbot }),
    logger,
  };

  const agent = createAgentInstance(
    {
      slug: 'researcher',
      instructions: 'Help',
      model: { default: MODEL, options: [MODEL] },
      tools,
      mcp,
    },
    {
      gateway: {
        chatModel: () => model,
        operation: () => ({ start: async () => {}, finish: async () => {} }),
      },
      config: ai,
      frogbot,
      mcp: connections,
    } as never,
  );

  return { agent, model };
}

function toolResults(call: LanguageModelV4CallOptions) {
  return call.prompt.flatMap((message) =>
    message.role === 'tool' ? message.content.filter((part) => part.type === 'tool-result') : [],
  );
}

describe('agents with MCP servers', () => {
  it('offers MCP tools to the model and sends a screenshot back as an image', async () => {
    const { agent, model } = setup({
      mcp: [fixture.server()],
      steps: [callTool('fixture_shot'), reply('Looks good')],
    });

    const result = await agent.stream({ prompt: 'Take a screenshot' });

    await expect(result.text).resolves.toBe('Looks good');

    const [first, second] = model.doStreamCalls;

    expect(first.tools?.map(({ name }) => name)).toContain('fixture_shot');
    expect(toolResults(second)).toEqual([
      expect.objectContaining({
        toolName: 'fixture_shot',
        output: {
          type: 'content',
          value: [
            { type: 'text', text: 'A screenshot' },
            expect.objectContaining({ mediaType: 'image/png' }),
          ],
        },
      }),
    ]);
  });

  it('keeps MCP tools active next to client tools', async () => {
    const { agent, model } = setup({ mcp: [fixture.server()], tools: [question] });

    await (await agent.stream({ prompt: 'Hello' })).consumeStream();

    expect(model.doStreamCalls[0].tools?.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['fixture_echo']),
    );
    expect(model.doStreamCalls[0].tools?.map(({ name }) => name)).not.toContain('question');
  });

  it('runs on without a server that fails, with one warning', async () => {
    const { agent, model } = setup({ mcp: [fixture.server({ command: ['frogbot-no-such-mcp'] })] });

    await expect((await agent.stream({ prompt: 'Hello' })).text).resolves.toBe('Done');

    expect(model.doStreamCalls[0].tools ?? []).toEqual([]);
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(
        "[frogbot] MCP server 'fixture' for agent 'researcher' is unavailable",
      ),
    );
  });

  it('replays a stored screenshot as an image, even with the server down', async () => {
    const { agent, model } = setup({ mcp: [fixture.server({ command: ['frogbot-no-such-mcp'] })] });

    const messages: UIMessage[] = [
      { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Take a screenshot' }] },
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'fixture_shot',
            toolCallId: 'call-1',
            state: 'output-available',
            input: {},
            output: {
              content: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
              isError: false,
            },
          },
        ],
      },
      { id: 'user-2', role: 'user', parts: [{ type: 'text', text: 'What did you see?' }] },
    ];

    await (await agent.stream({ messages })).consumeStream();

    expect(toolResults(model.doStreamCalls[0])).toEqual([
      expect.objectContaining({
        output: {
          type: 'content',
          value: [expect.objectContaining({ mediaType: 'image/png' })],
        },
      }),
    ]);
  });
});

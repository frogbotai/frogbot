import type * as Gateway from '@frogbotai/gateway';
import type * as AI from 'ai';
import type { ModelMessage, UIMessage } from 'ai';
import { Output } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { SKIPPED_FOR_CLIENT_INPUT } from '../../../../packages/frogbot/src/agents/tools.js';
import type { AgentModelId } from '../../../../packages/frogbot/src/agents/types.js';
import type { SanitizedAIConfig } from '../../../../packages/frogbot/src/ai/types.js';
import type * as MessagePersistence from '../../../../packages/frogbot/src/chat/messagePersistence.js';
import type * as State from '../../../../packages/frogbot/src/chat/turn/state.js';
import { mcpServer } from '../../../../packages/frogbot/src/mcp/server.js';
import type * as MCPTools from '../../../../packages/frogbot/src/mcp/tools.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import { NO_TOOL_ACCESS } from '../../../../packages/frogbot/src/tools/access.js';
import { NOT_APPROVABLE } from '../../../../packages/frogbot/src/tools/approval.js';
import { sanitizeToolList } from '../../../../packages/frogbot/src/tools/config/sanitize.js';
import { question } from '../../../../packages/frogbot/src/tools/question.js';
import type { AnyTool, Tool } from '../../../../packages/frogbot/src/tools/types.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

type AgentRecord = {
  settings: Record<string, unknown>;
  prepared?: Record<string, unknown>;
};

const agentState = vi.hoisted(() => ({
  agents: [] as AgentRecord[],
  prepared: undefined as Record<string, unknown> | undefined,
  generateCall: undefined as Record<string, unknown> | undefined,
  generateError: undefined as Error | undefined,
  streamCall: undefined as Record<string, unknown> | undefined,
}));

const turn = vi.hoisted(() => ({
  holdTurn: vi.fn(),
  persistAssistantMessage: vi.fn(),
  promoteQueuedMessage: vi.fn(),
  promoteSteerMessages: vi.fn(),
  releaseTurn: vi.fn(),
  resolveChatContext: vi.fn(),
  resolveMCPTools: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('ai', async (importOriginal) => {
  const original = await importOriginal<typeof AI>();
  type MockSettings = Record<string, unknown> & {
    prepareCall: (call: Record<string, unknown>) => Promise<Record<string, unknown>>;
    tools: unknown;
  };

  return {
    ...original,
    ToolLoopAgent: class {
      readonly settings: MockSettings;
      readonly record: AgentRecord;

      constructor(settings: MockSettings) {
        this.settings = settings;
        this.record = { settings };
        agentState.agents.push(this.record);
      }

      async prepare(call: Record<string, unknown>) {
        agentState.prepared = await this.settings.prepareCall({ ...this.settings, ...call });
        this.record.prepared = agentState.prepared;
      }

      get tools() {
        return this.settings.tools;
      }

      async generate(call: Record<string, unknown>) {
        const { onEnd: _onEnd, onFinish: _onFinish, ...options } = call;

        await this.prepare(options);
        agentState.generateCall = call;

        if (agentState.generateError) throw agentState.generateError;

        return {
          text: 'ok',
          finishReason: 'stop',
          rawFinishReason: 'stop',
          usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
          totalUsage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
          steps: [{ content: [{ type: 'text', text: 'ok' }] }],
        };
      }

      async stream(call: Record<string, unknown>) {
        await this.prepare(call);
        agentState.streamCall = call;

        return {};
      }
    },
  };
});

vi.mock('@frogbotai/gateway', async (importOriginal) => ({
  ...(await importOriginal<typeof Gateway>()),
  calculateModelCostUSD: () => 0,
  runHooks: async <T>(
    hooks: Array<(args: T) => void | Promise<void>> | undefined,
    args: T,
    options?: { isolate?: boolean },
  ) => {
    for (const hook of hooks ?? []) {
      if (!options?.isolate) {
        await hook(args);
        continue;
      }

      try {
        await hook(args);
      } catch {
        continue;
      }
    }
  },
}));

vi.mock('../../../../packages/frogbot/src/chat/chatContext.js', () => ({
  resolveChatContext: turn.resolveChatContext,
}));

vi.mock('../../../../packages/frogbot/src/chat/messagePersistence.js', async (importOriginal) => ({
  ...(await importOriginal<typeof MessagePersistence>()),
  persistAssistantMessage: turn.persistAssistantMessage,
}));

vi.mock('../../../../packages/frogbot/src/chat/turn/state.js', async (importOriginal) => ({
  ...(await importOriginal<typeof State>()),
  holdTurn: turn.holdTurn,
  releaseTurn: turn.releaseTurn,
}));

vi.mock('../../../../packages/frogbot/src/chat/turn/queue.js', () => ({
  promoteQueuedMessage: turn.promoteQueuedMessage,
  promoteSteerMessages: turn.promoteSteerMessages,
}));

vi.mock('../../../../packages/frogbot/src/mcp/tools.js', async (importOriginal) => ({
  ...(await importOriginal<typeof MCPTools>()),
  resolveMCPTools: turn.resolveMCPTools,
}));

const { createAgentInstance } = await import('../../../../packages/frogbot/src/agents/instance.js');

const claim = { chatId: 'chat-1', attempt: 'attempt-1' };

const history: UIMessage[] = [
  { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
];

const lookup = {
  slug: 'lookup',
  description: 'Look up data',
  inputSchema: z.object({ query: z.string() }),
  execute: vi.fn(() => ({ found: true })),
};

function makeConfig(hooks: SanitizedAIConfig['hooks']): SanitizedAIConfig {
  return {
    providers: { openai: { apiKey: 'test' } },
    routers: {},
    compaction: { auto: true, keep: 15_000 },
    hooks,
    access: {
      generate: () => true,
      embed: () => true,
      transcribe: () => true,
      rerank: () => true,
      evaluate: () => true,
    },
    telemetry: { enabled: false },
    usage: { slug: 'ai-usage' },
    _internal: { deploymentId: 'test' },
  };
}

function allowOnly(models: string[]): SanitizedAIConfig {
  const config = makeConfig(emptyHooks());

  return {
    ...config,
    access: { ...config.access, generate: ({ model }) => models.includes(model) },
  };
}

function emptyHooks(): SanitizedAIConfig['hooks'] {
  return {
    beforeOperation: [],
    beforeUpstream: [],
    afterUpstream: [],
    afterError: [],
    afterOperation: [],
  };
}

function makeDeps(config: SanitizedAIConfig, req: FrogBotRequest) {
  const lift = (context: Record<string, unknown>) => {
    const seed = context as { req?: FrogBotRequest; agent?: unknown };

    return { req: seed.req, user: seed.req?.user, agent: seed.agent };
  };

  const runHooks = async (
    hooks: Array<(args: unknown) => void | Promise<void>> | undefined,
    args: Record<string, unknown>,
    context: Record<string, unknown>,
  ) => {
    for (const hook of hooks ?? []) {
      await hook({ ...args, ...lift(context) });
    }
  };

  const operationModel = vi.fn((id?: string) => ({ modelId: id }));
  const operation = vi.fn(
    (opts: { operation: string; model: string; context?: Record<string, unknown> }) => {
      const requestId = `req_${Math.random().toString(36).slice(2)}`;
      const context = opts.context ?? {};
      let finished = false;

      return {
        requestId,
        context,
        start: async () => {
          await runHooks(
            config.hooks?.beforeOperation as never,
            { phase: 'beforeOperation', operation: opts.operation, requestId },
            context,
          );
        },
        finish: async (result?: { finishReason?: string; usage?: unknown; error?: unknown }) => {
          if (finished) return;
          finished = true;

          await runHooks(
            config.hooks?.afterOperation as never,
            {
              phase: 'afterOperation',
              operation: opts.operation,
              requestId,
              finishReason: result?.finishReason,
              usage: result?.usage,
              error: result?.error,
            },
            context,
          );
        },
        chatModel: operationModel,
      };
    },
  );

  const frogbot = {
    config: {
      ai: { routers: {}, access: config.access },
      chat: {
        enabled: true,
        chatsSlug: 'chats',
        messagesSlug: 'messages',
        assetsSlug: 'frogbot-chat-assets',
      },
    },
    create: vi.fn(() => Promise.resolve({ id: 'message-1' })),
    delete: vi.fn(() => Promise.resolve({})),
    find: vi.fn((args: { limit?: number }) =>
      Promise.resolve({
        docs:
          args.limit === 1
            ? []
            : [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
      }),
    ),
    findByID: vi.fn(() => Promise.resolve({ id: 'chat-1', user: req.user?.id ?? null })),
    generateText: vi.fn(() => Promise.resolve({ text: 'Chat title' })),
    logger: { error: vi.fn(), warn: vi.fn() },
    update: vi.fn(() => Promise.resolve({ id: 'chat-1' })),
    createRequest: vi.fn(() => {
      Object.assign(req, { frogbot });

      return Promise.resolve(req);
    }),
  };

  return {
    gateway: { chatModel: vi.fn(() => ({})), operation, operationModel },
    config,
    frogbot,
  } as never;
}

function makeReq(user: { id: string } | null = { id: 'user-1' }) {
  return { user, context: {}, payload: { db: {} } } as unknown as FrogBotRequest;
}

beforeEach(() => {
  agentState.agents = [];
  agentState.prepared = undefined;
  agentState.generateCall = undefined;
  agentState.generateError = undefined;
  agentState.streamCall = undefined;

  lookup.execute.mockClear();

  turn.stop.mockReset();

  turn.holdTurn
    .mockReset()
    .mockReturnValue({ signal: new AbortController().signal, stop: turn.stop });

  turn.persistAssistantMessage.mockReset().mockResolvedValue(undefined);
  turn.promoteQueuedMessage.mockReset();
  turn.promoteSteerMessages.mockReset().mockResolvedValue([]);
  turn.releaseTurn.mockReset().mockResolvedValue(true);
  turn.resolveMCPTools.mockReset().mockResolvedValue({ tools: {}, approvals: new Map() });

  turn.resolveChatContext.mockReset().mockResolvedValue({
    status: 'ready',
    chatId: 'chat-1',
    uiMessages: history,
    claim,
    selection: {},
  });
});

describe('agent hook lifecycle', () => {
  it('uses one stable run ID for hooks and agent runtime context', async () => {
    const beforeOperation = vi.fn();
    const afterOperation = vi.fn();
    const hooks = emptyHooks();
    hooks.beforeOperation.push(beforeOperation);
    hooks.afterOperation.push(afterOperation);
    const config = makeConfig(hooks);
    const req = { user: { id: 'user-1' }, payload: { db: {} } } as unknown as FrogBotRequest;
    const tool = {
      slug: 'lookup',
      description: 'Look up data',
      inputSchema: z.object({ query: z.string() }),
      execute: vi.fn(),
    };

    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
        tools: [tool],
      },
      makeDeps(config, req),
    );

    await agent.generate({ prompt: 'Hello' });

    const runtimeContext = agentState.prepared?.runtimeContext as {
      agent: { slug: string; runId: string };
    };

    expect(beforeOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        user: req.user,
        agent: runtimeContext.agent,
      }),
    );
    expect(runtimeContext.agent.slug).toBe('support');

    const toolsContext = agentState.prepared?.toolsContext as Record<
      string,
      { agent: { slug: string; runId: string } }
    >;

    expect(toolsContext.lookup.agent).toEqual(runtimeContext.agent);
    expect(afterOperation).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        agent: runtimeContext.agent,
        finishReason: 'stop',
        usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
      }),
    );
  });

  it('finalizes a stream once when terminal callbacks repeat', async () => {
    const afterOperation = vi.fn();
    const hooks = emptyHooks();
    hooks.afterOperation.push(afterOperation);
    const config = makeConfig(hooks);
    const req = { user: { id: 'user-1' } } as FrogBotRequest;
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
      },
      makeDeps(config, req),
    );

    await agent.aiAgent.stream({
      prompt: 'Hello',
      options: { req, overrideAccess: false },
    });

    expect(afterOperation).not.toHaveBeenCalled();

    const onEnd = agentState.streamCall?.onEnd as (event: unknown) => Promise<void>;

    await onEnd({
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });

    await onEnd({
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });

    expect(afterOperation).toHaveBeenCalledOnce();
  });

  it('finalizes a stream that aborts before the first step completes', async () => {
    const afterOperation = vi.fn();
    const hooks = emptyHooks();
    hooks.afterOperation.push(afterOperation);
    const config = makeConfig(hooks);
    const req = { user: { id: 'user-1' } } as FrogBotRequest;
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
      },
      makeDeps(config, req),
    );

    const controller = new AbortController();

    await agent.aiAgent.stream({
      prompt: 'Hello',
      options: { req, overrideAccess: false },
      abortSignal: controller.signal,
    });

    controller.abort(new Error('cancelled'));

    await vi.waitFor(() => {
      expect(afterOperation).toHaveBeenCalledOnce();
    });

    expect(afterOperation).toHaveBeenCalledWith(
      expect.objectContaining({ finishReason: 'abort', error: expect.any(Error) }),
    );
  });
});

describe('agent generate turns', () => {
  it('runs and records the agent default for a scheduled-style generate without a user', async () => {
    const req = makeReq(null);
    req.context = { source: 'schedule' };

    const deps = makeDeps(makeConfig(emptyHooks()), req) as unknown as {
      gateway: { operationModel: ReturnType<typeof vi.fn> };
    };

    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o', 'openai/gpt-4.1'] },
        instructions: 'Help',
      },
      deps as never,
    );

    const result = await agent.generate({ prompt: 'Run report', req, overrideAccess: true });

    expect(result.text).toBe('ok');
    expect(deps.gateway.operationModel).toHaveBeenLastCalledWith('openai/gpt-4o');
    expect(turn.persistAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        mainModel: 'openai/gpt-4o',
        message: expect.objectContaining({
          metadata: expect.objectContaining({
            usage: expect.objectContaining({ model: 'openai/gpt-4o' }),
          }),
        }),
      }),
    );
  });

  it('rejects a stored model blocked for the turn user before generating', async () => {
    const req = makeReq();
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o', 'openai/gpt-4.1'] },
        instructions: 'Help',
      },
      makeDeps(allowOnly(['openai/gpt-4.1']), req),
    );

    turn.resolveChatContext.mockResolvedValue({
      status: 'ready',
      chatId: 'chat-1',
      uiMessages: history,
      claim,
      selection: { model: 'openai/gpt-4o' },
    });

    await expect(agent.generate({ prompt: 'Hello', req })).rejects.toMatchObject({
      code: 'selection-unavailable',
      status: 409,
      message: "Model 'openai/gpt-4o' is not allowed for this user. Allowed: 'openai/gpt-4.1'",
    });

    expect(agentState.generateCall).toBeUndefined();
    expect(turn.persistAssistantMessage).not.toHaveBeenCalled();
    expect(turn.stop).toHaveBeenCalledOnce();
    expect(turn.releaseTurn).toHaveBeenCalledWith({ req, claim, state: 'idle' });
  });

  it('rejects a stored model removed from the agent options before generating', async () => {
    const req = makeReq();
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    turn.resolveChatContext.mockResolvedValue({
      status: 'ready',
      chatId: 'chat-1',
      uiMessages: history,
      claim,
      selection: { model: 'openai/gpt-4.1' },
    });

    await expect(agent.generate({ prompt: 'Hello', req })).rejects.toMatchObject({
      code: 'selection-unavailable',
      status: 409,
      message:
        "Model 'openai/gpt-4.1' is not allowed for agent 'support'. Allowed: 'openai/gpt-4o'",
    });

    expect(agentState.generateCall).toBeUndefined();
    expect(turn.persistAssistantMessage).not.toHaveBeenCalled();
    expect(turn.stop).toHaveBeenCalledOnce();
    expect(turn.releaseTurn).toHaveBeenCalledWith({ req, claim, state: 'idle' });
  });

  it('runs a stream on the model it is given', async () => {
    const req = makeReq();
    const deps = makeDeps(makeConfig(emptyHooks()), req) as unknown as {
      gateway: { operationModel: ReturnType<typeof vi.fn> };
      frogbot: { create: ReturnType<typeof vi.fn> };
    };

    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o', 'openai/gpt-4.1'] },
        instructions: 'Help',
      },
      deps as never,
    );

    await agent.stream({ prompt: 'Hello', req, model: 'openai/gpt-4.1' as AgentModelId });

    expect(deps.gateway.operationModel).toHaveBeenLastCalledWith('openai/gpt-4.1');
    expect(turn.resolveChatContext).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'a model not on the agent list',
      opts: { model: 'openai/gpt-4.1' as AgentModelId },
      message:
        "Model 'openai/gpt-4.1' is not allowed for agent 'support'. Allowed: 'openai/gpt-4o'",
    },
    {
      name: 'an unknown reasoning option',
      opts: { reasoning: 'max' },
      message:
        "Reasoning option 'max' is not available for model 'openai/gpt-4o'. It has no reasoning options",
    },
  ])('refuses $name before any model call', async ({ opts, message }) => {
    const req = makeReq();
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await expect(agent.stream({ prompt: 'Hello', req, ...opts })).rejects.toMatchObject({
      code: 'selection-unavailable',
      message,
    });
    await expect(agent.generate({ prompt: 'Hello', req, ...opts })).rejects.toMatchObject({
      code: 'selection-unavailable',
      message,
    });

    expect(agentState.streamCall).toBeUndefined();
    expect(agentState.generateCall).toBeUndefined();
    expect(turn.resolveChatContext).not.toHaveBeenCalled();
  });

  it("runs generate on the given model over the chat's selection and saves no selection", async () => {
    const req = makeReq();
    const deps = makeDeps(makeConfig(emptyHooks()), req) as unknown as {
      gateway: { operationModel: ReturnType<typeof vi.fn> };
    };

    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o', 'openai/gpt-4.1'] },
        instructions: 'Help',
      },
      deps as never,
    );

    turn.resolveChatContext.mockResolvedValue({
      status: 'ready',
      chatId: 'chat-1',
      uiMessages: history,
      claim,
      selection: { model: 'openai/gpt-4o' },
    });

    await agent.generate({
      prompt: 'Hello',
      chatId: 'chat-1',
      req,
      model: 'openai/gpt-4.1' as AgentModelId,
    });

    expect(deps.gateway.operationModel).toHaveBeenLastCalledWith('openai/gpt-4.1');
    expect(turn.resolveChatContext).toHaveBeenCalledWith(
      expect.not.objectContaining({ selection: expect.anything() }),
    );
    expect(turn.persistAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({ mainModel: 'openai/gpt-4.1' }),
    );
  });

  it('runs on the user fallback and records it as the main model', async () => {
    const req = makeReq();
    const deps = makeDeps(allowOnly(['openai/gpt-4.1']), req) as unknown as {
      gateway: { operationModel: ReturnType<typeof vi.fn> };
    };

    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o', 'openai/gpt-4.1'] },
        instructions: 'Help',
      },
      deps as never,
    );

    await agent.generate({ prompt: 'Hello', req });

    expect(deps.gateway.operationModel).toHaveBeenLastCalledWith('openai/gpt-4.1');
    expect(turn.persistAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        mainModel: 'openai/gpt-4.1',
        message: expect.objectContaining({
          metadata: expect.objectContaining({
            usage: expect.objectContaining({ model: 'openai/gpt-4.1' }),
          }),
        }),
      }),
    );
  });

  it('resolves the chat without queueing and persists the generated reply', async () => {
    const config = makeConfig(emptyHooks());
    const req = makeReq();
    const deps = makeDeps(config, req) as unknown as {
      frogbot: { create: ReturnType<typeof vi.fn> };
    };

    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
      },
      deps as never,
    );

    await agent.generate({ prompt: 'Hello', chatId: 'chat-1', req });

    expect(turn.resolveChatContext).toHaveBeenCalledWith({
      req,
      agentSlug: 'support',
      chatId: 'chat-1',
      incoming: [
        { id: expect.any(String), role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
      ],
      tools: agent.aiAgent.tools,
      queue: false,
    });
    expect(turn.persistAssistantMessage).toHaveBeenCalledWith({
      req,
      chatId: 'chat-1',
      message: expect.objectContaining({
        role: 'assistant',
        parts: expect.arrayContaining([expect.objectContaining({ type: 'text', text: 'ok' })]),
      }),
      history,
      mainModel: 'openai/gpt-4o',
    });
    expect(deps.frogbot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'usage-logs',
        data: expect.objectContaining({ runId: expect.any(String), chat: 'chat-1' }),
      }),
    );
  });

  it('releases the turn and promotes the next queued message after persisting', async () => {
    const req = makeReq();
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({ prompt: 'Hello', req });

    expect(turn.holdTurn).toHaveBeenCalledWith({ req, claim });
    expect(turn.releaseTurn).toHaveBeenCalledWith({ req, claim, state: 'idle' });
    expect(turn.persistAssistantMessage.mock.invocationCallOrder[0]).toBeLessThan(
      turn.releaseTurn.mock.invocationCallOrder[0],
    );
    expect(turn.stop).toHaveBeenCalledOnce();
    expect(turn.promoteQueuedMessage).toHaveBeenCalledWith({ req, chatId: 'chat-1' });
  });

  it('does not promote queued messages when the turn lease was lost', async () => {
    turn.releaseTurn.mockResolvedValue(false);

    const req = makeReq();
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({ prompt: 'Hello', req });

    expect(turn.promoteQueuedMessage).not.toHaveBeenCalled();
  });

  it('releases the turn without persisting when the model call fails', async () => {
    agentState.generateError = new Error('Model unavailable');

    const req = makeReq();
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await expect(agent.generate({ prompt: 'Hello', req })).rejects.toThrow('Model unavailable');
    expect(turn.persistAssistantMessage).not.toHaveBeenCalled();
    expect(turn.stop).toHaveBeenCalledOnce();
    expect(turn.releaseTurn).toHaveBeenCalledWith({ req, claim, state: 'idle' });
  });

  it('aborts the model call when the turn lease is lost', async () => {
    const lease = new AbortController();

    turn.holdTurn.mockReturnValue({ signal: lease.signal, stop: turn.stop });

    const req = makeReq();
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({ prompt: 'Hello', req });

    lease.abort(new Error('lease lost'));

    expect((agentState.generateCall?.abortSignal as AbortSignal).aborted).toBe(true);
  });

  it('refuses a local call with no user and no flag before resolving the chat', async () => {
    const req = makeReq(null);
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await expect(agent.generate({ prompt: 'Create', req })).rejects.toMatchObject({ status: 401 });
    expect(turn.resolveChatContext).not.toHaveBeenCalled();
  });

  it('runs trusted local calls without a user or an agent access check', async () => {
    const access = vi.fn(() => false);
    const req = makeReq(null);
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
        access,
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({ prompt: 'Create', req, overrideAccess: true });

    expect(access).not.toHaveBeenCalled();
    expect(turn.persistAssistantMessage).toHaveBeenCalledOnce();
  });

  it('checks agent access before resolving the chat when overrideAccess is false', async () => {
    const req = makeReq();
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
        access: () => false,
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await expect(
      agent.generate({ prompt: 'Hello', req, overrideAccess: false }),
    ).rejects.toMatchObject({ status: 403 });
    expect(turn.resolveChatContext).not.toHaveBeenCalled();
  });
});

describe('agent client tool gate', () => {
  it('withholds client tools from callers that cannot render them', async () => {
    const req = makeReq();
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
        tools: [lookup, question],
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({ prompt: 'Hello', req });

    expect(agentState.prepared?.activeTools).toEqual(['lookup']);
  });

  it('activates client tools for the kinds the caller renders', async () => {
    const req = makeReq();
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
        tools: [lookup, question],
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.aiAgent.stream({
      prompt: 'Hello',
      options: { req, clientTools: { kinds: ['question'] } },
    });

    expect(agentState.prepared?.activeTools).toEqual(['lookup', 'question']);
  });

  it('leaves tool selection alone for agents without client tools', async () => {
    const req = makeReq();
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
        tools: [lookup],
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({ prompt: 'Hello', req });

    expect(agentState.prepared).not.toHaveProperty('activeTools');
    expect(agentState.prepared?.toolApproval).toBeTypeOf('function');
  });

  it('skips server tools called in the same step as a client tool', async () => {
    const req = makeReq();
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
        tools: [lookup, question],
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({ prompt: 'Hello', req });

    const toolApproval = agentState.prepared?.toolApproval as (args: {
      toolCall: { toolName: string };
      messages: ModelMessage[];
    }) => Promise<unknown>;

    const execute = agent.aiAgent.tools.lookup.execute!;
    const clientStep: ModelMessage[] = [];
    const serverStep: ModelMessage[] = [];

    expect(
      await toolApproval({ toolCall: { toolName: 'question' }, messages: clientStep }),
    ).toEqual({ type: 'not-applicable' });
    expect(await toolApproval({ toolCall: { toolName: 'lookup' }, messages: serverStep })).toEqual({
      type: 'not-applicable',
    });
    expect(
      await execute({ query: 'a' }, {
        toolCallId: 'call-1',
        messages: clientStep,
        context: {},
      } as never),
    ).toEqual(SKIPPED_FOR_CLIENT_INPUT);
    expect(
      await execute({ query: 'b' }, {
        toolCallId: 'call-2',
        messages: serverStep,
        context: {},
      } as never),
    ).toEqual({ found: true });
    expect(lookup.execute).toHaveBeenCalledExactlyOnceWith({ query: 'b' }, {});
  });

  const docs = mcpServer({ name: 'docs', type: 'remote', url: 'http://localhost/mcp' });
  const docsTools = { docs_search: { description: 'Search' }, docs_read: { description: 'Read' } };

  async function runWithMCP(tools: AnyTool[], options: Record<string, unknown> = {}) {
    turn.resolveMCPTools.mockResolvedValue({ tools: docsTools, approvals: new Map() });

    const req = makeReq();
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
        tools,
        mcp: [docs],
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.aiAgent.stream({ prompt: 'Hello', options: { req, ...options } });

    return agentState.prepared!;
  }

  it('activates every MCP tool next to server and rendered client tools', async () => {
    const prepared = await runWithMCP([lookup, question], { clientTools: { kinds: ['question'] } });

    expect(prepared.activeTools).toEqual(['lookup', 'question', 'docs_search', 'docs_read']);
  });

  it('adds MCP tools without activeTools when the agent has no client tools', async () => {
    const prepared = await runWithMCP([lookup]);

    expect(prepared).not.toHaveProperty('activeTools');
    expect(Object.keys(prepared.tools as object)).toEqual(['lookup', 'docs_search', 'docs_read']);
  });

  it('keeps every MCP tool and allowed server tool when one is denied', async () => {
    const prepared = await runWithMCP([lookup, { ...lookup, slug: 'refund', access: () => false }]);

    expect(prepared.activeTools).toEqual(['lookup', 'docs_search', 'docs_read']);
  });

  it('applies client kinds and MCP names next to a denial', async () => {
    const prepared = await runWithMCP(
      [lookup, question, { ...lookup, slug: 'refund', access: () => false }],
      { clientTools: { kinds: [] } },
    );

    expect(prepared.activeTools).toEqual(['lookup', 'docs_search', 'docs_read']);
  });
});

describe('agent tool access', () => {
  const tool = (slug: string, access?: Tool['access']): Tool => ({
    ...lookup,
    slug,
    ...(access ? { access } : {}),
  });

  async function prepare(tools: AnyTool[], run: 'stream' | 'generate' = 'stream', opts = {}) {
    const req = makeReq();
    const deps = makeDeps(makeConfig(emptyHooks()), req);
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
        tools,
      },
      deps,
    );

    if (run === 'generate') {
      await agent.generate({ prompt: 'Hello', req, ...opts });
    } else {
      await agent.aiAgent.stream({ prompt: 'Hello', options: { req, ...opts } });
    }

    return {
      prepared: agentState.prepared!,
      req,
      logger: (deps as { frogbot: { logger: { warn: ReturnType<typeof vi.fn> } } }).frogbot.logger,
    };
  }

  it('leaves a denied tool out of activeTools and keeps an allowed one', async () => {
    const { prepared } = await prepare([
      tool('open', () => true),
      tool('refund', () => false),
      lookup,
    ]);

    expect(prepared.activeTools).toEqual(['open', 'lookup']);
  });

  it('awaits an async rule', async () => {
    const { prepared } = await prepare([
      tool('open', () => Promise.resolve(true)),
      tool('refund', () => Promise.resolve(false)),
    ]);

    expect(prepared.activeTools).toEqual(['open']);
  });

  it('denies a tool whose rule throws, and logs it', async () => {
    const failure = new Error('lookup failed');
    const { prepared, logger } = await prepare([
      lookup,
      tool('refund', () => {
        throw failure;
      }),
    ]);

    expect(prepared.activeTools).toEqual(['lookup']);
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      { err: failure, tool: 'refund', agent: 'support' },
      "[frogbot] Tool 'refund' access threw; the tool is hidden.",
    );
  });

  it('leaves activeTools unset when every rule allows', async () => {
    const { prepared } = await prepare([lookup, tool('open', () => true)]);

    expect(prepared).not.toHaveProperty('activeTools');
  });

  it.each([
    ['stream', {}],
    ['generate', { overrideAccess: false }],
  ] as const)('denies on %s with %o', async (run, opts) => {
    const { prepared } = await prepare([lookup, tool('refund', () => false)], run, opts);

    expect(prepared.activeTools).toEqual(['lookup']);
    await expect(
      (prepared.toolApproval as (args: unknown) => Promise<unknown>)({
        toolCall: { toolName: 'refund' },
        messages: [],
      }),
    ).resolves.toEqual({ type: 'denied', reason: NO_TOOL_ACCESS });
  });

  it.each(['stream', 'generate'] as const)(
    'offers a denied tool on a trusted %s without running its rule',
    async (run) => {
      const access = vi.fn(() => false);
      const { prepared } = await prepare([lookup, tool('refund', access)], run, {
        overrideAccess: true,
      });

      expect(prepared).not.toHaveProperty('activeTools');
      expect(access).not.toHaveBeenCalled();
      await expect(
        (prepared.toolApproval as (args: unknown) => Promise<unknown>)({
          toolCall: { toolName: 'refund' },
          messages: [],
        }),
      ).resolves.toEqual({ type: 'not-applicable' });
    },
  );

  it('passes the rule the run request, agent and tool slug', async () => {
    const access = vi.fn(() => true);
    const { prepared, req } = await prepare([tool('refund', access)], 'stream', {
      chatId: 'chat-1',
    });

    const { agent } = prepared.runtimeContext as { agent: { runId: string } };

    expect(access).toHaveBeenCalledExactlyOnceWith({
      req,
      agent: { slug: 'support', runId: agent.runId, chatId: 'chat-1' },
      tool: { slug: 'refund' },
    });
  });

  it('hides only the spread piece tool given a rule', async () => {
    const createGmail = definePiece({
      slug: 'gmail',
      label: 'Gmail',
      actions: [
        {
          slug: 'send_email',
          description: 'Send',
          input: z.object({}),
          run: () => Promise.resolve('sent'),
        },
        {
          slug: 'read_email',
          description: 'Read',
          input: z.object({}),
          run: () => Promise.resolve('read'),
        },
      ],
    });

    const gmail = createGmail();
    const access = vi.fn(() => false);
    const { prepared } = await prepare(
      sanitizeToolList([gmail, { ...gmail.send_email, access }], "Agent 'support'"),
    );

    expect(prepared.activeTools).toEqual(['gmail_read_email']);
    expect(access).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ tool: { slug: 'gmail_send_email' } }),
    );
  });
});

describe('agent run access', () => {
  type Entry = 'generate' | 'stream' | 'aiAgent.generate' | 'aiAgent.stream';
  const entries: Entry[] = ['generate', 'stream', 'aiAgent.generate', 'aiAgent.stream'];

  function setup(access: (args: unknown) => boolean | Promise<boolean>) {
    const req = makeReq();
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
        tools: [lookup],
        access,
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    const run = (entry: Entry, opts: { overrideAccess?: boolean }) => {
      switch (entry) {
        case 'generate':
          return agent.generate({ prompt: 'Hello', req, ...opts });
        case 'stream':
          return agent.stream({ prompt: 'Hello', req, ...opts });
        case 'aiAgent.generate':
          return agent.aiAgent.generate({ prompt: 'Hello', options: { req, ...opts } });
        case 'aiAgent.stream':
          return agent.aiAgent.stream({ prompt: 'Hello', options: { req, ...opts } });
      }
    };

    return { req, run };
  }

  const toolCtx = () =>
    (agentState.prepared!.toolsContext as Record<string, { overrideAccess: boolean }>).lookup;

  it.each(entries)('checks agent access once on %s when not trusted', async (entry) => {
    const access = vi.fn(() => true);
    const { req, run } = setup(access);

    await run(entry, {});

    expect(access).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ req }));
    expect(toolCtx().overrideAccess).toBe(false);
  });

  it.each(entries)('skips agent access on a trusted %s', async (entry) => {
    const access = vi.fn(() => false);
    const { run } = setup(access);

    await run(entry, { overrideAccess: true });

    expect(access).not.toHaveBeenCalled();
    expect(toolCtx().overrideAccess).toBe(true);
  });

  it.each(entries)('fails %s with 500 when access throws', async (entry) => {
    const { run } = setup(() => {
      throw new Error('rule failed');
    });

    await expect(run(entry, { overrideAccess: false })).rejects.toMatchObject({
      status: 500,
      code: 'access-error',
    });
    expect(agentState.prepared).toBeUndefined();
  });

  it('ignores a forged access-checked key on aiAgent options', async () => {
    const access = vi.fn(() => false);
    const { req } = setup(access);
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
        access,
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await expect(
      agent.aiAgent.stream({
        prompt: 'Hello',
        options: { req, [Symbol('frogbot.agentAccessChecked')]: true },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('agent tool approval', () => {
  const createMail = definePiece({
    slug: 'mail',
    label: 'Mail',
    actions: [
      {
        slug: 'send',
        description: 'Send',
        input: z.object({}),
        run: () => Promise.resolve('sent'),
      },
    ],
  });

  const mail = createMail();

  const rule: Tool = {
    ...lookup,
    slug: 'rule',
    approval: ({ input }) =>
      (input as { query: string }).query === 'big' ? { mode: 'ask', reason: 'Big one' } : false,
  };

  const tools: AnyTool[] = [
    { ...lookup, slug: 'plain', approval: 'ask' },
    { ...lookup, slug: 'spread', approval: 'required' },
    { ...mail.send, approval: 'ask' },
    rule,
  ];

  async function approvalFor({
    toolName,
    input = { query: 'a' },
    options = {},
    chat,
  }: {
    toolName: string;
    input?: unknown;
    options?: Record<string, unknown>;
    chat?: { autoApprove?: boolean };
  }) {
    const req = makeReq();
    const deps = makeDeps(makeConfig(emptyHooks()), req) as {
      frogbot: { findByID: ReturnType<typeof vi.fn> };
    };

    if (chat) deps.frogbot.findByID.mockResolvedValue({ id: 'chat-1', ...chat });

    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
        tools: [lookup, ...tools],
      },
      deps as never,
    );

    await agent.aiAgent.stream({ prompt: 'Hello', options: { req, ...options } });

    const toolApproval = agentState.prepared?.toolApproval as (args: {
      toolCall: { toolName: string; input: unknown };
      messages: ModelMessage[];
    }) => Promise<unknown>;

    return toolApproval({ toolCall: { toolName, input }, messages: [] });
  }

  const ask = { clientTools: { kinds: [], approval: true } };

  it.each([
    ['lookup', ask, { type: 'not-applicable' }],
    ['plain', ask, { type: 'user-approval' }],
    ['plain', { ...ask, autoApprove: true }, { type: 'approved' }],
    ['plain', {}, { type: 'denied', reason: NOT_APPROVABLE }],
    ['plain', { autoApprove: true }, { type: 'approved' }],
    ['spread', { ...ask, autoApprove: true }, { type: 'user-approval' }],
    ['spread', { autoApprove: true }, { type: 'denied', reason: NOT_APPROVABLE }],
    ['mail_send', ask, { type: 'user-approval' }],
    ['mail_send', { ...ask, autoApprove: true }, { type: 'approved' }],
    ['mail_send', {}, { type: 'denied', reason: NOT_APPROVABLE }],
  ])('resolves %s with %o to %o', async (toolName, options, expected) => {
    expect(await approvalFor({ toolName, options })).toEqual(expected);
  });

  it('runs a rule per call and shows its reason', async () => {
    expect(await approvalFor({ toolName: 'rule', options: ask })).toEqual({
      type: 'not-applicable',
    });
    expect(await approvalFor({ toolName: 'rule', input: { query: 'big' }, options: ask })).toEqual({
      type: 'user-approval',
      reason: 'Big one',
    });
  });

  it("reads the chat's autoApprove unless the run sets it", async () => {
    const chat = { autoApprove: true };

    expect(
      await approvalFor({ toolName: 'plain', options: { ...ask, chatId: 'chat-1' }, chat }),
    ).toEqual({ type: 'approved' });
    expect(
      await approvalFor({
        toolName: 'plain',
        options: { ...ask, chatId: 'chat-1', autoApprove: false },
        chat,
      }),
    ).toEqual({ type: 'user-approval' });
    expect(
      await approvalFor({ toolName: 'spread', options: { ...ask, chatId: 'chat-1' }, chat }),
    ).toEqual({ type: 'user-approval' });
  });
});

describe('agent steer messages', () => {
  it('promotes steer messages from the same author at each step boundary', async () => {
    const steer: UIMessage = {
      id: 'steer-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Faster' }],
    };

    turn.promoteSteerMessages.mockResolvedValue([{ message: steer, selection: {} }]);

    const req = makeReq();
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({ prompt: 'Hello', req });

    const prepareStep = agentState.prepared?.prepareStep as (args: {
      messages: ModelMessage[];
    }) => Promise<{ messages: ModelMessage[] } | undefined>;

    const messages: ModelMessage[] = [{ role: 'user', content: 'Hello' }];

    await expect(prepareStep({ messages })).resolves.toEqual({
      model: expect.anything(),
      messages: [...messages, { role: 'user', content: [{ type: 'text', text: 'Faster' }] }],
    });
    expect(turn.promoteSteerMessages).toHaveBeenCalledWith({
      req,
      chatId: 'chat-1',
      actor: { user: { collection: '', id: 'user-1' } },
    });
  });

  it('keeps the messages unchanged when no steer message is waiting', async () => {
    const req = makeReq();
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({ prompt: 'Hello', req });

    const prepareStep = agentState.prepared?.prepareStep as (args: {
      messages: ModelMessage[];
    }) => Promise<{ messages: ModelMessage[] }>;

    const messages: ModelMessage[] = [{ role: 'user', content: 'Hello' }];

    const step = await prepareStep({ messages });

    expect(step).toEqual({ model: expect.anything(), messages });
    expect(step.messages).toBe(messages);
  });

  it('does not steer runs without a chat', async () => {
    const req = makeReq();
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
        instructions: 'Help',
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.aiAgent.stream({ prompt: 'Hello', options: { req } });

    const prepareStep = agentState.prepared?.prepareStep as (args: {
      messages: ModelMessage[];
    }) => Promise<unknown>;

    await prepareStep({ messages: [] });

    expect(turn.promoteSteerMessages).not.toHaveBeenCalled();
  });
});

describe('agent compaction', () => {
  const SMALL = 'local/small' as AgentModelId;
  const long = (text: string) => `${text} ${'x'.repeat(8_000)}`;
  const chatHistory: UIMessage[] = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: long('First') }] },
    { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: long('Answer') }] },
    { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Next' }] },
  ];

  const summary = '## Objective\n- Talk about frogs.';
  const kept: ModelMessage = { role: 'user', content: [{ type: 'text', text: 'Next' }] };
  const reply: ModelMessage[] = [{ role: 'assistant', content: [{ type: 'text', text: 'Done' }] }];

  type Step = (args: {
    messages: ModelMessage[];
    initialMessages: ModelMessage[];
    stepNumber: number;
    steps: unknown[];
  }) => Promise<{ model: Record<string, unknown>; messages: ModelMessage[] }>;

  function smallConfig(): SanitizedAIConfig {
    return {
      ...makeConfig(emptyHooks()),
      compaction: { auto: true, keep: 200 },
      providers: {
        local: {
          type: 'openai-compatible',
          baseUrl: 'http://localhost:11434/v1',
          models: [{ id: 'small', mode: 'chat', limit: { context: 4_000 } }],
        },
      },
    };
  }

  function setup() {
    turn.resolveChatContext.mockResolvedValue({
      status: 'ready',
      chatId: 'chat-1',
      uiMessages: chatHistory,
      claim,
      selection: {},
    });

    const req = makeReq();
    const deps = makeDeps(smallConfig(), req) as unknown as {
      frogbot: { generateText: ReturnType<typeof vi.fn> };
    };

    deps.frogbot.generateText.mockResolvedValue({
      text: summary,
      usage: { inputTokens: 4_100, outputTokens: 12 },
    });

    const agent = createAgentInstance(
      { slug: 'support', model: { default: SMALL, options: [SMALL] }, instructions: 'Help' },
      deps as never,
    );

    return { agent, req, generateText: deps.frogbot.generateText };
  }

  async function chatRun() {
    const { agent, req, generateText } = setup();

    await agent.generate({ prompt: 'Next', req });

    const initialMessages = agentState.generateCall!.messages as ModelMessage[];

    return {
      initialMessages,
      prepareStep: agentState.prepared!.prepareStep as Step,
      generateText,
    };
  }

  const checkpoint = expect.objectContaining({
    role: 'user',
    content: [{ type: 'text', text: expect.stringContaining(`<summary>\n${summary}\n</summary>`) }],
  });

  it('sends the whole history when the chat is under the ceiling', async () => {
    const { initialMessages, prepareStep, generateText } = await chatRun();
    const short = initialMessages.slice(-1);

    const step = await prepareStep({
      messages: short,
      initialMessages: short,
      stepNumber: 0,
      steps: [],
    });

    expect(step.messages).toBe(short);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('compacts before the first step when the history is over the ceiling', async () => {
    const { initialMessages, prepareStep, generateText } = await chatRun();

    const step = await prepareStep({
      messages: initialMessages,
      initialMessages,
      stepNumber: 0,
      steps: [],
    });

    expect(step.messages).toEqual([checkpoint, kept]);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: SMALL,
        maxOutputTokens: 32_000,
        messages: [
          ...initialMessages.slice(0, 2),
          { role: 'user', content: expect.stringContaining('<template>') },
        ],
      }),
    );
  });

  it("compacts before a later step from the previous step's prompt tokens", async () => {
    const { initialMessages, prepareStep } = await chatRun();
    const short = initialMessages;

    const step = await prepareStep({
      messages: [...short, ...reply],
      initialMessages: short,
      stepNumber: 2,
      steps: [{ usage: { inputTokens: 3_700 }, response: { messages: reply } }],
    });

    expect(step.messages).toEqual([checkpoint, kept, ...reply]);
  });

  it('keeps steered messages after the compacted prefix', async () => {
    const { initialMessages, prepareStep } = await chatRun();

    turn.promoteSteerMessages.mockResolvedValue([
      {
        message: { id: 'steer-1', role: 'user', parts: [{ type: 'text', text: 'Faster' }] },
        selection: {},
      },
    ]);

    const step = await prepareStep({
      messages: [...initialMessages, ...reply],
      initialMessages,
      stepNumber: 2,
      steps: [{ usage: { inputTokens: 3_700 }, response: { messages: reply } }],
    });

    expect(step.messages).toEqual([
      checkpoint,
      kept,
      ...reply,
      { role: 'user', content: [{ type: 'text', text: 'Faster' }] },
    ]);
  });

  it('swaps the carried prefix for the checkpoint on the steps after a compaction', async () => {
    const { initialMessages, prepareStep } = await chatRun();

    const first = await prepareStep({
      messages: initialMessages,
      initialMessages,
      stepNumber: 0,
      steps: [],
    });

    const second = await prepareStep({
      messages: [...first.messages, ...reply],
      initialMessages,
      stepNumber: 1,
      steps: [{ usage: { inputTokens: 40 }, response: { messages: reply } }],
    });

    expect(second.messages).toEqual([checkpoint, kept, ...reply]);
  });

  it('never compacts a run without a chat', async () => {
    const { agent, req, generateText } = setup();

    await agent.aiAgent.stream({ prompt: 'Hello', options: { req } });

    const prepareStep = agentState.prepared!.prepareStep as Step;
    const messages: ModelMessage[] = [{ role: 'user', content: long('Hello') }];

    const step = await prepareStep({
      messages,
      initialMessages: messages,
      stepNumber: 1,
      steps: [{ usage: { inputTokens: 3_900 }, response: { messages: [] } }],
    });

    expect(step.messages).toBe(messages);
    expect(step.model).not.toHaveProperty('doStream');
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe('agent model input pass', () => {
  type PrepareStep = (args: {
    messages: ModelMessage[];
    stepNumber?: number;
  }) => Promise<{ messages: ModelMessage[] }>;

  const LOCAL_MEDIA = 'local/media' as AgentModelId;
  const LOCAL_TEXT_ONLY = 'local/text-only' as AgentModelId;

  const photo: ModelMessage = {
    role: 'user',
    content: [
      { type: 'text', text: 'What is this?' },
      { type: 'file', data: 'aGVsbG8=', mediaType: 'image/png', filename: 'photo.png' },
    ],
  };

  const photoMarker: ModelMessage = {
    role: 'user',
    content: [
      { type: 'text', text: 'What is this?' },
      { type: 'text', text: "[Can't read photo.png: this model doesn't accept images]" },
    ],
  };

  function mediaConfig(): SanitizedAIConfig {
    return {
      ...makeConfig(emptyHooks()),
      providers: {
        local: {
          type: 'openai-compatible',
          baseUrl: 'http://localhost:11434/v1',
          models: [
            {
              id: 'media',
              mode: 'chat',
              modalities: { input: ['text', 'image', 'audio', 'video', 'pdf'], output: ['text'] },
            },
            { id: 'text-only', mode: 'chat', modalities: { input: ['text'], output: ['text'] } },
          ],
        },
      },
    };
  }

  async function startRun({
    model,
    tools,
  }: {
    model: AgentModelId;
    tools?: Parameters<typeof createAgentInstance>[0]['tools'];
  }) {
    const req = makeReq();
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: model, options: [LOCAL_MEDIA, LOCAL_TEXT_ONLY] },
        instructions: 'Help',
        tools,
      },
      makeDeps(mediaConfig(), req),
    );

    await agent.generate({ prompt: 'Hello', req });

    return { agent, prepareStep: agentState.prepared?.prepareStep as PrepareStep };
  }

  it("replaces media the step's model can't read with a marker", async () => {
    const { prepareStep } = await startRun({ model: LOCAL_TEXT_ONLY });

    const step = await prepareStep({ messages: [photo], stepNumber: 0 });

    expect(step.messages).toEqual([photoMarker]);
  });

  it('sends the same messages when the model reads every attachment', async () => {
    const { prepareStep } = await startRun({ model: LOCAL_MEDIA });
    const messages = [photo];

    const step = await prepareStep({ messages, stepNumber: 0 });

    expect(step.messages).toBe(messages);
  });

  it('replaces images from the step a steer switches to a text-only model', async () => {
    const { prepareStep } = await startRun({ model: LOCAL_MEDIA });
    const messages = [photo];

    const before = await prepareStep({ messages, stepNumber: 0 });

    turn.promoteSteerMessages.mockResolvedValue([
      {
        message: { id: 'steer-1', role: 'user', parts: [{ type: 'text', text: 'Shorter' }] },
        selection: { model: 'local/text-only' },
      },
    ]);

    const after = await prepareStep({ messages, stepNumber: 1 });

    expect(before.messages).toBe(messages);
    expect(after.messages).toEqual([
      photoMarker,
      { role: 'user', content: [{ type: 'text', text: 'Shorter' }] },
    ]);
  });

  it('loads steered pasted text with its label', async () => {
    const { prepareStep } = await startRun({ model: LOCAL_MEDIA });

    turn.promoteSteerMessages.mockResolvedValue([
      {
        message: {
          id: 'steer-1',
          role: 'user',
          parts: [{ type: 'data-paste', data: { text: 'line one' } }],
        },
        selection: {},
      },
    ]);

    const step = await prepareStep({ messages: [], stepNumber: 0 });

    expect(step.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Pasted text:\nline one' }] },
    ]);
  });

  it('still skips server tools in a client-tool step whose messages the pass replaced', async () => {
    const { agent, prepareStep } = await startRun({
      model: LOCAL_TEXT_ONLY,
      tools: [lookup, question],
    });

    const toolApproval = agentState.prepared?.toolApproval as (args: {
      toolCall: { toolName: string };
      messages: ModelMessage[];
    }) => Promise<unknown>;

    const execute = agent.aiAgent.tools.lookup.execute!;

    const { messages } = await prepareStep({ messages: [photo], stepNumber: 0 });

    await toolApproval({ toolCall: { toolName: 'question' }, messages });

    expect(messages).not.toEqual([photo]);
    expect(
      await execute({ query: 'a' }, { toolCallId: 'call-1', messages, context: {} } as never),
    ).toEqual(SKIPPED_FOR_CLIENT_INPUT);
    expect(lookup.execute).not.toHaveBeenCalled();
  });
});

describe('agent setup', () => {
  const THINKER = 'local/thinker' as AgentModelId;
  const docs = mcpServer({ name: 'docs', type: 'remote', url: 'http://localhost/mcp' });
  const docsTools = { docs_search: { description: 'Search' }, docs_read: { description: 'Read' } };
  const selection = { model: THINKER, reasoning: 'high' };

  function thinkerConfig(): SanitizedAIConfig {
    return {
      ...makeConfig(emptyHooks()),
      providers: {
        local: {
          type: 'openai-compatible',
          baseUrl: 'http://localhost:11434/v1',
          models: [
            {
              id: 'thinker',
              mode: 'chat',
              reasoningOptions: [{ type: 'effort', values: ['low', 'high'] }],
            },
          ],
        },
      },
    };
  }

  function representative() {
    turn.resolveMCPTools.mockResolvedValue({
      tools: docsTools,
      approvals: new Map([['docs_read', 'ask']]),
    });

    turn.resolveChatContext.mockResolvedValue({
      status: 'ready',
      chatId: 'chat-1',
      uiMessages: history,
      claim,
      selection,
    });

    const req = makeReq();
    const agent = createAgentInstance(
      {
        slug: 'support',
        model: { default: THINKER, options: [THINKER] },
        instructions: 'Help',
        tools: [
          lookup,
          question,
          { ...lookup, slug: 'refund', access: () => false },
          { ...lookup, slug: 'plain', approval: 'ask' },
        ],
        mcp: [docs],
      },
      makeDeps(thinkerConfig(), req),
    );

    return { agent, req };
  }

  type Prepared = Record<string, unknown> & {
    runtimeContext: { agent: { runId: string } };
    toolApproval: (args: {
      toolCall: { toolName: string; input?: unknown };
      messages: ModelMessage[];
    }) => Promise<unknown>;
    prepareStep: (args: { messages: ModelMessage[]; stepNumber: number }) => Promise<unknown>;
  };

  function pinned({
    agent,
    req,
    prepared,
    chatId,
    input,
    activeTools,
  }: {
    agent: ReturnType<typeof representative>['agent'];
    req: FrogBotRequest;
    prepared: Prepared;
    chatId?: string;
    input: Record<string, unknown>;
    activeTools: string[];
  }) {
    const { runId } = prepared.runtimeContext.agent;
    const ctx = {
      req,
      frogbot: req.frogbot,
      agent: { slug: 'support', runId, chatId },
      overrideAccess: false,
    };

    return {
      id: 'support',
      model: { modelId: THINKER },
      instructions: 'Help',
      tools: { ...agent.aiAgent.tools, ...docsTools },
      stopWhen: undefined,
      prepareCall: expect.any(Function),
      ...input,
      runtimeContext: { agent: ctx.agent },
      toolsContext: { lookup: ctx, refund: ctx, plain: ctx },
      activeTools,
      toolApproval: expect.any(Function),
      prepareStep: expect.any(Function),
    };
  }

  const streamed = { experimental_transform: [expect.any(Function)], onEnd: expect.any(Function) };

  const userMessage: ModelMessage[] = [
    { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  ];

  async function approvals(prepared: Prepared, agent: ReturnType<typeof representative>['agent']) {
    const clientStep: ModelMessage[] = [];
    const serverStep: ModelMessage[] = [];
    const approve = (toolName: string, messages: ModelMessage[] = serverStep) =>
      prepared.toolApproval({ toolCall: { toolName, input: { query: 'a' } }, messages });

    const results = {
      question: await approve('question', clientStep),
      lookup: await approve('lookup'),
      refund: await approve('refund'),
      plain: await approve('plain'),
      docs_read: await approve('docs_read'),
    };

    const execute = agent.aiAgent.tools.lookup.execute!;
    const skipped = (messages: ModelMessage[]) =>
      execute({ query: 'a' }, { toolCallId: 'call-1', messages, context: {} } as never);

    return {
      ...results,
      clientStepSkipped: await skipped(clientStep),
      serverStepSkipped: await skipped(serverStep),
    };
  }

  const structured = Output.object({ schema: z.object({ team: z.string() }) });

  function runAgents(output: typeof structured | undefined) {
    const [base, run, ...rest] = agentState.agents;

    expect(rest).toEqual([]);
    expect(base.settings).not.toHaveProperty('output');

    if (output === undefined) {
      expect(run).toBeUndefined();

      return { prepared: base.prepared as Prepared, settings: {} };
    }

    expect(base.prepared).toBeUndefined();
    expect(run.settings.output).toBe(output);

    return { prepared: run.prepared as Prepared, settings: { output } };
  }

  it.each([
    ['text', undefined],
    ['structured', structured],
  ])('pins a chat generate run (%s)', async (_, output) => {
    const { agent, req } = representative();

    await agent.generate({ prompt: 'Hello', req, output });

    const { prepared, settings } = runAgents(output);

    expect(prepared).toEqual({
      ...pinned({
        agent,
        req,
        prepared,
        chatId: 'chat-1',
        input: { messages: userMessage, abortSignal: expect.any(AbortSignal) },
        activeTools: ['lookup', 'plain', 'docs_search', 'docs_read'],
      }),
      ...settings,
    });
    expect(await approvals(prepared, agent)).toEqual({
      question: { type: 'not-applicable' },
      lookup: { type: 'not-applicable' },
      refund: { type: 'denied', reason: NO_TOOL_ACCESS },
      plain: { type: 'denied', reason: NOT_APPROVABLE },
      docs_read: { type: 'denied', reason: NOT_APPROVABLE },
      clientStepSkipped: SKIPPED_FOR_CLIENT_INPUT,
      serverStepSkipped: { found: true },
    });
    await expect(prepared.prepareStep({ messages: userMessage, stepNumber: 0 })).resolves.toEqual({
      model: expect.objectContaining({ modelId: THINKER, specificationVersion: 'v4' }),
      providerOptions: { local: { reasoningEffort: 'high' } },
      messages: userMessage,
    });
  });

  it.each([
    ['text', undefined],
    ['structured', structured],
  ])('pins a stream run without a chat (%s)', async (_, output) => {
    const { agent, req } = representative();

    await agent.stream({ prompt: 'Hello', req, output });

    const { prepared, settings } = runAgents(output);

    expect(prepared).toEqual({
      ...pinned({
        agent,
        req,
        prepared,
        input: { prompt: 'Hello', abortSignal: undefined },
        activeTools: ['lookup', 'plain', 'docs_search', 'docs_read'],
      }),
      ...streamed,
      ...settings,
    });
    expect(await approvals(prepared, agent)).toEqual({
      question: { type: 'not-applicable' },
      lookup: { type: 'not-applicable' },
      refund: { type: 'denied', reason: NO_TOOL_ACCESS },
      plain: { type: 'denied', reason: NOT_APPROVABLE },
      docs_read: { type: 'denied', reason: NOT_APPROVABLE },
      clientStepSkipped: SKIPPED_FOR_CLIENT_INPUT,
      serverStepSkipped: { found: true },
    });
    await expect(prepared.prepareStep({ messages: userMessage, stepNumber: 0 })).resolves.toEqual({
      model: { modelId: THINKER },
      messages: userMessage,
    });
  });

  it('pins a chat turn run with rendered client tools', async () => {
    const { agent, req } = representative();
    const options = {
      chatId: 'chat-1',
      selection,
      clientTools: { kinds: ['question'], approval: true },
    };

    await agent.aiAgent.stream({ prompt: 'Hello', options: { req, ...options } });

    const prepared = agentState.prepared as Prepared;

    expect(prepared).toEqual({
      ...pinned({
        agent,
        req,
        prepared,
        chatId: 'chat-1',
        input: { prompt: 'Hello', abortSignal: undefined },
        activeTools: ['lookup', 'question', 'plain', 'docs_search', 'docs_read'],
      }),
      ...streamed,
    });
    expect(await approvals(prepared, agent)).toEqual({
      question: { type: 'not-applicable' },
      lookup: { type: 'not-applicable' },
      refund: { type: 'denied', reason: NO_TOOL_ACCESS },
      plain: { type: 'user-approval' },
      docs_read: { type: 'user-approval' },
      clientStepSkipped: SKIPPED_FOR_CLIENT_INPUT,
      serverStepSkipped: { found: true },
    });
  });
});

describe('agent instructions', () => {
  const model = { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] } as const;

  const skillLines = ['- **docs**: Product documentation', '- **support**'];

  it('sends string instructions with the skill lines after them, as before', async () => {
    const req = makeReq();
    const agent = createAgentInstance(
      { slug: 'support', model, instructions: 'Help', skillLines },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({ prompt: 'Hello', req });

    expect(agentState.prepared?.instructions).toBe(
      'Help\n\n- **docs**: Product documentation\n- **support**',
    );
  });

  it('sends string instructions unchanged when there are no skills', async () => {
    const req = makeReq();
    const agent = createAgentInstance(
      { slug: 'support', model, instructions: 'Help' },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({ prompt: 'Hello', req });

    expect(agentState.prepared?.instructions).toBe('Help');
  });

  it('calls a function once per run with that run’s req, then appends skill lines', async () => {
    const req = makeReq();
    const instructions = vi.fn(({ req }: { req: FrogBotRequest }) =>
      Promise.resolve(`Help ${req.user?.id}`),
    );

    const agent = createAgentInstance(
      { slug: 'support', model, instructions, skillLines },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    expect(instructions).not.toHaveBeenCalled();

    await agent.generate({ prompt: 'Hello', req });

    expect(instructions).toHaveBeenCalledTimes(1);
    expect(instructions).toHaveBeenCalledWith({ req });
    expect(agentState.prepared?.instructions).toBe(
      'Help user-1\n\n- **docs**: Product documentation\n- **support**',
    );
  });

  it('computes each run from its own req and current data, on generate and stream', async () => {
    const source = { rule: 'v1' };
    const first = makeReq({ id: 'user-1' });
    const second = makeReq({ id: 'user-2' });
    const instructions = vi.fn(
      ({ req }: { req: FrogBotRequest }) => `Rule ${source.rule} for ${req.user?.id}`,
    );

    const deps = makeDeps(makeConfig(emptyHooks()), first) as unknown as {
      frogbot: { createRequest: ReturnType<typeof vi.fn> };
    };

    deps.frogbot.createRequest.mockImplementation((req: FrogBotRequest) =>
      Promise.resolve(Object.assign(req, { frogbot: deps.frogbot })),
    );

    const agent = createAgentInstance({ slug: 'support', model, instructions }, deps as never);

    await agent.generate({ prompt: 'Hello', req: first });
    const firstText = agentState.prepared?.instructions;

    source.rule = 'v2';
    await agent.stream({ prompt: 'Hello', req: second });

    expect(firstText).toBe('Rule v1 for user-1');
    expect(agentState.prepared?.instructions).toBe('Rule v2 for user-2');
    expect(instructions).toHaveBeenCalledTimes(2);
  });

  it('resolves the function for structured-output runs', async () => {
    const req = makeReq();
    const agent = createAgentInstance(
      { slug: 'support', model, instructions: () => 'Fresh' },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({
      prompt: 'Hello',
      req,
      output: Output.object({ schema: z.object({ ok: z.boolean() }) }),
    });

    expect(agentState.prepared?.instructions).toBe('Fresh');
  });

  it.each([
    { name: 'an empty string', value: '', message: 'returned an empty string' },
    { name: 'a whitespace-only string', value: '  \n', message: 'returned an empty string' },
    { name: 'a non-string', value: 42, message: 'returned a non-string value' },
  ])('fails the run before the model call when the function returns $name', async (row) => {
    const req = makeReq();
    const agent = createAgentInstance(
      { slug: 'support', model, instructions: (() => row.value) as () => string },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await expect(agent.generate({ prompt: 'Hello', req })).rejects.toThrow(
      `[frogbot] Agent 'support' instructions ${row.message}.`,
    );
    await expect(agent.stream({ prompt: 'Hello', req })).rejects.toThrow(row.message);

    expect(agentState.generateCall).toBeUndefined();
    expect(agentState.streamCall).toBeUndefined();
  });

  it('lets an error thrown by the function fail the run before the model call', async () => {
    const req = makeReq();
    const error = new Error('plan file missing');
    const agent = createAgentInstance(
      {
        slug: 'support',
        model,
        instructions: () => {
          throw error;
        },
      },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await expect(agent.generate({ prompt: 'Hello', req })).rejects.toBe(error);

    expect(agentState.generateCall).toBeUndefined();
  });
});

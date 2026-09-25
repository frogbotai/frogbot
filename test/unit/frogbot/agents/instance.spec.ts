import type * as Gateway from '@frogbotai/gateway';
import type * as AI from 'ai';
import type { ModelMessage, UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { SKIPPED_FOR_CLIENT_INPUT } from '../../../../packages/frogbot/src/agents/tools.js';
import type { SanitizedAIConfig } from '../../../../packages/frogbot/src/ai/types.js';
import type * as MessagePersistence from '../../../../packages/frogbot/src/chat/messagePersistence.js';
import type * as State from '../../../../packages/frogbot/src/chat/turn/state.js';
import { question } from '../../../../packages/frogbot/src/tools/question.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

const agentState = vi.hoisted(() => ({
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

      constructor(settings: MockSettings) {
        this.settings = settings;
      }

      get tools() {
        return this.settings.tools;
      }

      async generate(call: Record<string, unknown>) {
        agentState.prepared = await this.settings.prepareCall({ ...this.settings, ...call });
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
        agentState.prepared = await this.settings.prepareCall({ ...this.settings, ...call });
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
    hooks,
    access: {
      generate: () => true,
      embed: () => true,
      transcribe: () => true,
      rerank: () => true,
      evaluate: () => true,
    },
    telemetry: { enabled: false },
    _internal: { deploymentId: 'test' },
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
  // Mirrors the gateway's operation lifecycle: hooks receive top-level
  // req/user/agent lifted from the seeded context (as toGatewayHooks does in prod).
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
        chatModel: () => ({}),
      };
    },
  );
  const frogbot = {
    config: {
      ai: { routers: {} },
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
    logger: { error: vi.fn() },
    update: vi.fn(() => Promise.resolve({ id: 'chat-1' })),
    createRequest: vi.fn(() => {
      Object.assign(req, { frogbot });
      return Promise.resolve(req);
    }),
  };
  return {
    gateway: { chatModel: vi.fn(() => ({})), operation },
    config,
    frogbot,
  } as never;
}

function makeReq(user: { id: string } | null = { id: 'user-1' }) {
  return { user, context: {}, payload: { db: {} } } as unknown as FrogBotRequest;
}

beforeEach(() => {
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

  turn.resolveChatContext
    .mockReset()
    .mockResolvedValue({ status: 'ready', chatId: 'chat-1', uiMessages: history, claim });
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
      { slug: 'support', model: 'openai/test', instructions: 'Help', tools: [tool] },
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
      { slug: 'support', model: 'openai/test', instructions: 'Help' },
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
      { slug: 'support', model: 'openai/test', instructions: 'Help' },
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
  it('resolves the chat without queueing and persists the generated reply', async () => {
    const config = makeConfig(emptyHooks());
    const req = makeReq();
    const deps = makeDeps(config, req) as unknown as {
      frogbot: { create: ReturnType<typeof vi.fn> };
    };
    const agent = createAgentInstance(
      { slug: 'support', model: 'openai/test', instructions: 'Help' },
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
      mainModel: 'openai/test',
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
      { slug: 'support', model: 'openai/test', instructions: 'Help' },
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
      { slug: 'support', model: 'openai/test', instructions: 'Help' },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({ prompt: 'Hello', req });

    expect(turn.promoteQueuedMessage).not.toHaveBeenCalled();
  });

  it('releases the turn without persisting when the model call fails', async () => {
    agentState.generateError = new Error('Model unavailable');

    const req = makeReq();
    const agent = createAgentInstance(
      { slug: 'support', model: 'openai/test', instructions: 'Help' },
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
      { slug: 'support', model: 'openai/test', instructions: 'Help' },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({ prompt: 'Hello', req });

    lease.abort(new Error('lease lost'));

    expect((agentState.generateCall?.abortSignal as AbortSignal).aborted).toBe(true);
  });

  it('runs trusted local calls without a user or an agent access check', async () => {
    const access = vi.fn(() => false);
    const req = makeReq(null);
    const agent = createAgentInstance(
      { slug: 'support', model: 'openai/test', instructions: 'Help', access },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({ prompt: 'Create', req });

    expect(access).not.toHaveBeenCalled();
    expect(turn.persistAssistantMessage).toHaveBeenCalledOnce();
  });

  it('checks agent access before resolving the chat when overrideAccess is false', async () => {
    const req = makeReq();
    const agent = createAgentInstance(
      { slug: 'support', model: 'openai/test', instructions: 'Help', access: () => false },
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
      { slug: 'support', model: 'openai/test', instructions: 'Help', tools: [lookup, question] },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({ prompt: 'Hello', req });

    expect(agentState.prepared?.activeTools).toEqual(['lookup']);
  });

  it('activates client tools for the kinds the caller renders', async () => {
    const req = makeReq();
    const agent = createAgentInstance(
      { slug: 'support', model: 'openai/test', instructions: 'Help', tools: [lookup, question] },
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
      { slug: 'support', model: 'openai/test', instructions: 'Help', tools: [lookup] },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({ prompt: 'Hello', req });

    expect(agentState.prepared).not.toHaveProperty('activeTools');
    expect(agentState.prepared).not.toHaveProperty('toolApproval');
  });

  it('skips server tools called in the same step as a client tool', async () => {
    const req = makeReq();
    const agent = createAgentInstance(
      { slug: 'support', model: 'openai/test', instructions: 'Help', tools: [lookup, question] },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({ prompt: 'Hello', req });

    const toolApproval = agentState.prepared?.toolApproval as (args: {
      toolCall: { toolName: string };
      messages: ModelMessage[];
    }) => string;
    const execute = agent.aiAgent.tools.lookup!.execute!;
    const clientStep: ModelMessage[] = [];
    const serverStep: ModelMessage[] = [];

    expect(toolApproval({ toolCall: { toolName: 'question' }, messages: clientStep })).toBe(
      'not-applicable',
    );
    expect(toolApproval({ toolCall: { toolName: 'lookup' }, messages: serverStep })).toBe(
      'not-applicable',
    );
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
});

describe('agent steer messages', () => {
  it('promotes steer messages from the same author at each step boundary', async () => {
    const steer: UIMessage = {
      id: 'steer-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Faster' }],
    };

    turn.promoteSteerMessages.mockResolvedValue([steer]);

    const req = makeReq();
    const agent = createAgentInstance(
      { slug: 'support', model: 'openai/test', instructions: 'Help' },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({ prompt: 'Hello', req });

    const prepareStep = agentState.prepared?.prepareStep as (args: {
      messages: ModelMessage[];
    }) => Promise<{ messages: ModelMessage[] } | undefined>;
    const messages: ModelMessage[] = [{ role: 'user', content: 'Hello' }];

    await expect(prepareStep({ messages })).resolves.toEqual({
      messages: [...messages, { role: 'user', content: [{ type: 'text', text: 'Faster' }] }],
    });
    expect(turn.promoteSteerMessages).toHaveBeenCalledWith({
      req,
      chatId: 'chat-1',
      actor: { user: { collection: '', id: 'user-1' } },
    });
  });

  it('keeps the step unchanged when no steer message is waiting', async () => {
    const req = makeReq();
    const agent = createAgentInstance(
      { slug: 'support', model: 'openai/test', instructions: 'Help' },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.generate({ prompt: 'Hello', req });

    const prepareStep = agentState.prepared?.prepareStep as (args: {
      messages: ModelMessage[];
    }) => Promise<unknown>;

    await expect(prepareStep({ messages: [] })).resolves.toBeUndefined();
  });

  it('does not steer runs without a chat', async () => {
    const req = makeReq();
    const agent = createAgentInstance(
      { slug: 'support', model: 'openai/test', instructions: 'Help' },
      makeDeps(makeConfig(emptyHooks()), req),
    );

    await agent.aiAgent.stream({ prompt: 'Hello', options: { req } });

    expect(agentState.prepared).not.toHaveProperty('prepareStep');
  });
});

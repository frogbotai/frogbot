import type {
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import type { StopCondition, ToolSet, UIMessage } from 'ai';
import { isStepCount, NoObjectGeneratedError, NoOutputGeneratedError, Output } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type {
  AgentAccess,
  AgentModelId,
  AgentStreamMessageResult,
} from '../../../../packages/frogbot/src/agents/types.js';
import {
  channelConversationKey,
  resolveChannelChat,
} from '../../../../packages/frogbot/src/channels/conversation.js';
import { createChannelChatAccess } from '../../../../packages/frogbot/src/chat/channelAccess.js';
import { NOT_APPROVABLE } from '../../../../packages/frogbot/src/tools/approval.js';
import { question } from '../../../../packages/frogbot/src/tools/question.js';
import type { AnyTool, ToolCtx } from '../../../../packages/frogbot/src/tools/types.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

type StoredMessage = UIMessage & { chat: string; version: number; status?: string };

const turn = vi.hoisted(() => ({
  messages: [] as StoredMessage[],
  claimTurn: vi.fn(),
  holdTurn: vi.fn(),
  promoteQueuedMessage: vi.fn(),
  promoteSteerMessages: vi.fn(),
  releaseTurn: vi.fn(),
}));

vi.mock('../../../../packages/frogbot/src/chat/turn/state.js', () => ({
  claimTurn: turn.claimTurn,
  holdTurn: turn.holdTurn,
  releaseTurn: turn.releaseTurn,
}));

vi.mock('../../../../packages/frogbot/src/chat/turn/queue.js', () => ({
  promoteQueuedMessage: turn.promoteQueuedMessage,
  promoteSteerMessages: turn.promoteSteerMessages,
}));

vi.mock('../../../../packages/frogbot/src/database/compareAndSet.js', () => ({
  updateIfVersion: ({
    id,
    version,
    data,
  }: {
    id: string;
    version: number;
    data: Record<string, unknown>;
  }) => {
    const stored = turn.messages.find((message) => message.id === id);

    if (!stored || stored.version !== version) return Promise.resolve(false);

    Object.assign(stored, data, { version: version + 1 });

    return Promise.resolve(true);
  },
}));

const { createAgentInstance } = await import('../../../../packages/frogbot/src/agents/instance.js');

const claim = { chatId: 'chat-1', attempt: 'attempt-1' };

const ai = {
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
        {
          id: 'writer',
          mode: 'chat',
          reasoningOptions: [{ type: 'effort', values: ['max'] }],
        },
      ],
    },
  },
  routers: {},
  compaction: { auto: true, keep: 15_000 },
  access: {},
};

const LOCAL_THINKER = 'local/thinker' as AgentModelId;
const LOCAL_WRITER = 'local/writer' as AgentModelId;

const lookup: AnyTool = {
  slug: 'lookup',
  description: 'Look up data',
  inputSchema: z.object({}),
  execute: () => ({ found: true }),
};

const usage = {
  inputTokens: { total: 2, noCache: 2, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function response(text = 'Hello back'): LanguageModelV4StreamPart[] {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: text },
    { type: 'text-end', id: 'text-1' },
    { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
  ];
}

function modelStream(parts: LanguageModelV4StreamPart[]) {
  return new ReadableStream<LanguageModelV4StreamPart>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }

      controller.close();
    },
  });
}

function toolLoopStream(answer = 'Found it'): MockLanguageModelV4['doStream'] {
  let step = 0;

  return () =>
    Promise.resolve({
      stream: modelStream(
        step++ === 0
          ? [
              { type: 'stream-start', warnings: [] },
              { type: 'tool-call', toolCallId: 'call-1', toolName: 'lookup', input: '{}' },
              { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage },
            ]
          : response(answer),
      ),
    });
}

function toolLoopGenerate(
  answer = 'Found it',
  toolName = 'lookup',
): MockLanguageModelV4['doGenerate'] {
  let step = 0;

  return () =>
    Promise.resolve<LanguageModelV4GenerateResult>(
      step++ === 0
        ? {
            content: [{ type: 'tool-call', toolCallId: 'call-1', toolName, input: '{}' }],
            finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
            usage,
            warnings: [],
          }
        : {
            content: [{ type: 'text', text: answer }],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
            warnings: [],
          },
    );
}

function setup({
  access = () => true,
  allowed,
  user = 'user-1',
  owner = user,
  doStream = () => Promise.resolve({ stream: modelStream(response()) }),
  doGenerate,
  model: agentModel = 'openai/test' as AgentModelId,
  options = [],
  tools,
  stopWhen,
}: {
  access?: AgentAccess;
  allowed?: string[];
  user?: string | null;
  owner?: string | null;
  doStream?: MockLanguageModelV4['doStream'];
  doGenerate?: MockLanguageModelV4['doGenerate'];
  model?: AgentModelId;
  options?: readonly AgentModelId[];
  tools?: AnyTool[];
  stopWhen?: StopCondition<ToolSet>;
} = {}) {
  const calls: Array<{
    model: string;
    providerOptions: LanguageModelV4CallOptions['providerOptions'];
  }> = [];

  const formats: LanguageModelV4CallOptions['responseFormat'][] = [];

  const models = new Map<string, MockLanguageModelV4>();

  const chatModel = (id: string) => {
    const existing = models.get(id);

    if (existing) return existing;

    const created = new MockLanguageModelV4({
      modelId: id,
      doStream: async (options) => {
        calls.push({ model: id, providerOptions: options.providerOptions });
        formats.push(options.responseFormat);

        return doStream(options);
      },
      ...(doGenerate
        ? {
            doGenerate: async (options: LanguageModelV4CallOptions) => {
              calls.push({ model: id, providerOptions: options.providerOptions });
              formats.push(options.responseFormat);

              return doGenerate(options);
            },
          }
        : {}),
    });

    models.set(id, created);

    return created;
  };

  const model = chatModel(agentModel);
  const messages: StoredMessage[] = [];
  const chat = {
    id: 'chat-1',
    user: owner,
    title: 'Existing title',
    agent: 'support',
    channel: 'slack',
    channelKey: 'channel-key',
    channelThread: { account: 'slack-support', thread: { id: 'thread-1' } },
    lastMessageAt: undefined as string | undefined,
  };

  const finish = vi.fn(async () => {});
  const frogbot = {
    config: {
      ai: allowed
        ? { ...ai, access: { generate: ({ model }: { model: string }) => allowed.includes(model) } }
        : ai,
      chat: {
        enabled: true,
        chatsSlug: 'chats',
        messagesSlug: 'messages',
        assetsSlug: 'frogbot-chat-assets',
      },
    },
    createRequest: vi.fn((req: Partial<FrogBotRequest>) =>
      Promise.resolve('frogbot' in req ? req : { ...req, payload: { db: {} }, frogbot }),
    ),
    findByID: vi.fn(({ collection, id }: { collection: string; id: string }) =>
      Promise.resolve(
        collection === 'messages' ? (messages.find((message) => message.id === id) ?? null) : chat,
      ),
    ),
    find: vi.fn(
      ({
        collection,
        limit,
        where,
      }: {
        collection: string;
        limit?: number;
        where?: { channelKey?: { equals: string } };
      }) =>
        Promise.resolve({
          docs:
            collection === 'chats'
              ? where?.channelKey?.equals === chat.channelKey
                ? [chat]
                : []
              : limit === 1
                ? []
                : messages,
        }),
    ),
    create: vi.fn(({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      if (collection === 'messages') {
        messages.push({ version: 0, ...structuredClone(data) } as StoredMessage);
      }

      return Promise.resolve(collection === 'chats' ? { id: 'chat-2', ...data } : data);
    }),
    update: vi.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(Object.assign(chat, data)),
    ),
    delete: vi.fn(async () => {}),
    logger: { error: vi.fn() },
  };

  const req = {
    user: user === null ? null : { id: user },
    context: { channel: { piece: 'slack', threadId: 'thread-1', author: { id: 'author-1' } } },
    payload: { db: {} },
    frogbot,
  } as unknown as FrogBotRequest;

  const agent = createAgentInstance(
    {
      slug: 'support',
      instructions: 'Help',
      model: { default: agentModel, options: [...new Set([agentModel, ...options])] },
      access,
      tools,
      stopWhen,
    },
    {
      gateway: {
        chatModel: (id: string) => {
          const outside = () => Promise.reject(new Error(`${id} ran outside the turn operation`));

          return new MockLanguageModelV4({ modelId: id, doStream: outside, doGenerate: outside });
        },
        operation: () => ({ start: async () => {}, finish, chatModel }),
      },
      config: ai,
      frogbot,
    } as never,
  );

  turn.messages = messages;

  return { agent, calls, chat, finish, formats, frogbot, messages, model, req };
}

async function streamMessage(
  agent: ReturnType<typeof setup>['agent'],
  opts: Parameters<ReturnType<typeof setup>['agent']['streamMessage']>[0],
): Promise<AgentStreamMessageResult> {
  const result = await agent.streamMessage(opts);

  if (!('persistence' in result)) throw new Error('Expected the turn to start.');

  return result;
}

type ChannelAccess = Parameters<
  ReturnType<typeof setup>['agent']['streamMessage']
>[0]['channelAccess'];

function channelAccessFor(
  { agent, chat, req }: ReturnType<typeof setup>,
  scope: Partial<Parameters<typeof createChannelChatAccess>[0]> = {},
) {
  return createChannelChatAccess({
    req,
    agentSlug: agent.slug,
    chatId: chat.id,
    channelKey: chat.channelKey,
    ...scope,
  });
}

describe('agent persisted stream with the installed AI SDK', () => {
  beforeEach(() => {
    turn.claimTurn.mockReset().mockResolvedValue(claim);

    turn.holdTurn
      .mockReset()
      .mockReturnValue({ signal: new AbortController().signal, stop: vi.fn() });

    turn.promoteQueuedMessage.mockReset();
    turn.promoteSteerMessages.mockReset().mockResolvedValue([]);
    turn.releaseTurn.mockReset().mockResolvedValue(true);
  });

  it('denies agent access before reading or persisting conversation data', async () => {
    const access = vi.fn(() => false);
    const { agent, frogbot, messages, model, req } = setup({ access });

    await expect(
      agent.streamMessage({ req, chatId: 'chat-1', prompt: 'Denied', overrideAccess: false }),
    ).rejects.toMatchObject({ status: 403 });

    expect(access).toHaveBeenCalledOnce();
    expect(messages).toEqual([]);
    expect(frogbot.findByID).not.toHaveBeenCalled();
    expect(frogbot.find).not.toHaveBeenCalled();
    expect(frogbot.create).not.toHaveBeenCalled();
    expect(model.doStreamCalls).toEqual([]);
  });

  it.each([false, true])(
    'checks agent access once and gives tools overrideAccess %s',
    async (overrideAccess) => {
      const access = vi.fn(() => true);
      const execute = vi.fn((_input: unknown, ctx: ToolCtx) => ({ trusted: ctx.overrideAccess }));
      const { agent, req } = setup({
        access,
        tools: [{ ...lookup, execute }],
        doStream: toolLoopStream(),
      });

      const result = await streamMessage(agent, {
        req,
        chatId: 'chat-1',
        prompt: 'Find it',
        overrideAccess,
      });

      await result.persistence;

      expect(access).toHaveBeenCalledTimes(overrideAccess ? 0 : 1);
      expect(execute).toHaveBeenCalledExactlyOnceWith(
        {},
        expect.objectContaining({ overrideAccess }),
      );
    },
  );

  it('streams and persists a complete assistant turn', async () => {
    const { agent, chat, messages, req } = setup();

    const result = await streamMessage(agent, { req, chatId: 'chat-1', prompt: 'Hello' });
    const text: string[] = [];

    expect(chat.lastMessageAt).toEqual(expect.any(String));
    expect(messages.map((message) => message.role)).toEqual(['user']);

    for await (const part of result.stream) {
      if (part.type === 'text-delta') text.push(part.text);
    }

    await result.persistence;

    expect(text.join('')).toBe('Hello back');
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(messages[1].parts).toContainEqual(expect.objectContaining({ text: 'Hello back' }));
    expect(chat.lastMessageAt).toEqual(expect.any(String));
  });

  it('persists text already streamed when aborted before the first step finishes', async () => {
    const abort = new AbortController();
    const { agent, messages, req } = setup({
      doStream: () =>
        Promise.resolve({
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
              controller.enqueue({ type: 'stream-start', warnings: [] });
              controller.enqueue({ type: 'text-start', id: 'text-1' });
              controller.enqueue({ type: 'text-delta', id: 'text-1', delta: 'Partial' });

              abort.signal.addEventListener('abort', () => controller.error(abort.signal.reason), {
                once: true,
              });
            },
          }),
        }),
    });

    const result = await streamMessage(agent, {
      req,
      chatId: 'chat-1',
      prompt: 'Hello',
      abortSignal: abort.signal,
    });

    const parts: string[] = [];

    for await (const part of result.stream) {
      parts.push(part.type);

      if (part.type === 'text-delta') abort.abort();
    }

    await result.persistence;

    expect(parts).toContain('abort');
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(messages[1].parts).toContainEqual(expect.objectContaining({ text: 'Partial' }));
  });

  it.each([null, 'user-2'])(
    'keeps the ownership guard for a forged channel context (%s)',
    async (user) => {
      const { agent, frogbot, messages, req } = setup({ owner: 'user-1', user });

      req.context.channel = { piece: 'slack', threadId: 'thread-1', author: { id: 'author-1' } };

      await expect(
        agent.streamMessage({ req, chatId: 'chat-1', prompt: 'Forged', overrideAccess: true }),
      ).rejects.toMatchObject({ status: 404 });

      expect(messages).toEqual([]);
      expect(frogbot.find).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['user-1', 'user-2'],
    ['user-1', null],
    [null, 'user-1'],
    [null, null],
  ])(
    'allows a host-authorized author %s -> %s in the same channel conversation',
    async (owner, user) => {
      const access = vi.fn(() => true);
      const { agent, chat, messages, req } = setup({ owner, user, access });
      const channelAccess = createChannelChatAccess({
        req,
        agentSlug: agent.slug,
        chatId: chat.id,
        channelKey: chat.channelKey,
      });

      const result = await streamMessage(agent, {
        req,
        chatId: chat.id,
        prompt: 'Next participant',
        channelAccess,
        overrideAccess: false,
      });

      await result.persistence;

      expect(access).toHaveBeenCalledOnce();
      expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
      expect(chat.user).toBe(owner);
    },
  );

  it.each<[string, (context: ReturnType<typeof setup>) => ChannelAccess]>([
    ['forged', ({ chat }) => ({ channelKey: chat.channelKey })],
    ['request', (context) => channelAccessFor(context, { req: { ...context.req } })],
    ['agent', (context) => channelAccessFor(context, { agentSlug: 'other-agent' })],
    ['chat', (context) => channelAccessFor(context, { chatId: 'other-chat' })],
    ['key', (context) => channelAccessFor(context, { channelKey: 'other-key' })],
    [
      'web',
      (context) => {
        const channelAccess = channelAccessFor(context);

        context.chat.channelKey = '';

        return channelAccess;
      },
    ],
  ])('rejects a channel capability outside its %s scope', async (_, capability) => {
    const context = setup({ owner: 'owner', user: 'participant' });
    const { agent, chat, messages, req } = context;
    const channelAccess = capability(context);

    await expect(
      agent.streamMessage({ req, chatId: chat.id, prompt: 'Denied', channelAccess }),
    ).rejects.toMatchObject({ status: 404 });

    expect(messages).toEqual([]);
  });

  it('reuses persisted history as identified and anonymous authors alternate in a channel thread', async () => {
    const { agent, chat, messages, model, req: baseReq } = setup({ owner: null });
    const identity = {
      agent: agent.slug,
      piece: 'slack',
      account: 'slack-support',
      kind: 'thread' as const,
      peer: 'channel-1',
      thread: 'thread-1',
    };

    chat.channelKey = channelConversationKey(identity);

    for (const user of [null, 'user-1', 'user-2', null]) {
      const req = { ...baseReq, user: user === null ? null : { id: user } } as FrogBotRequest;
      const chatId = await resolveChannelChat({ req, identity, user });
      const channelAccess = createChannelChatAccess({
        req,
        agentSlug: agent.slug,
        chatId,
        channelKey: channelConversationKey(identity),
      });

      const result = await streamMessage(agent, {
        req,
        chatId,
        channelAccess,
        prompt: `Hello from ${user ?? 'anonymous'}`,
        overrideAccess: false,
      });

      await result.persistence;
    }

    expect(messages).toHaveLength(8);
    expect(new Set(messages.map((message) => message.chat))).toEqual(new Set([chat.id]));
    expect(model.doStreamCalls[3].prompt.filter((message) => message.role === 'user')).toHaveLength(
      4,
    );
    expect(
      model.doStreamCalls[3].prompt.filter((message) => message.role === 'assistant'),
    ).toHaveLength(3);
    expect(chat.user).toBeNull();
  });

  it('does not let a channel capability bypass the agent access check', async () => {
    const { agent, chat, frogbot, messages, req } = setup({ access: () => false });
    const channelAccess = createChannelChatAccess({
      req,
      agentSlug: agent.slug,
      chatId: chat.id,
      channelKey: chat.channelKey,
    });

    await expect(
      agent.streamMessage({
        req,
        chatId: chat.id,
        channelAccess,
        prompt: 'Denied',
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 });

    expect(messages).toEqual([]);
    expect(frogbot.findByID).not.toHaveBeenCalled();
  });

  it('waits for assistant persistence separately from the raw stream and surfaces write failures', async () => {
    const { agent, frogbot, req } = setup();
    const writing = Promise.withResolvers<void>();
    const write = Promise.withResolvers<never>();
    const create = frogbot.create.getMockImplementation()!;

    frogbot.create.mockImplementation(async (args) => {
      if (args.data.role === 'assistant') {
        writing.resolve();

        return write.promise;
      }

      return create(args);
    });

    const result = await streamMessage(agent, { req, chatId: 'chat-1', prompt: 'Hello' });

    await result.consumeStream();
    await writing.promise;

    expect(frogbot.update).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ collection: 'chats', id: 'chat-1' }),
    );

    write.reject(new Error('Assistant write failed'));

    await expect(result.persistence).rejects.toThrow('Assistant write failed');
  });

  it('rejects an already-aborted turn before persisting input', async () => {
    const { agent, messages, req } = setup();

    await expect(
      agent.streamMessage({
        req,
        chatId: 'chat-1',
        prompt: 'Hello',
        abortSignal: AbortSignal.abort(new Error('Already cancelled')),
      }),
    ).rejects.toThrow('Already cancelled');

    expect(messages).toEqual([]);
  });

  it('finalizes the operation and rejects persistence when the model fails before its first step', async () => {
    const failure = new Error('Model unavailable');
    const { agent, finish, messages, req } = setup({
      doStream: () => Promise.reject(failure),
    });

    const result = await streamMessage(agent, { req, chatId: 'chat-1', prompt: 'Hello' });

    await expect(result.persistence).rejects.toBe(failure);

    expect(finish).toHaveBeenCalledExactlyOnceWith({ error: failure });
    expect(messages.map((message) => message.role)).toEqual(['user']);
  });

  it('preserves the partial second step when an agent aborts after a tool step', async () => {
    const abort = new AbortController();
    let step = 0;
    const { agent, messages, req } = setup({
      tools: [
        {
          slug: 'lookup',
          description: 'Look up data',
          inputSchema: z.object({}),
          execute: () => ({ found: true }),
        },
      ],
      doStream: () =>
        Promise.resolve({
          stream:
            step++ === 0
              ? modelStream([
                  { type: 'stream-start', warnings: [] },
                  { type: 'tool-call', toolCallId: 'call-1', toolName: 'lookup', input: '{}' },
                  {
                    type: 'finish',
                    finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                    usage,
                  },
                ])
              : new ReadableStream<LanguageModelV4StreamPart>({
                  start(controller) {
                    controller.enqueue({ type: 'stream-start', warnings: [] });
                    controller.enqueue({ type: 'text-start', id: 'partial-2' });

                    controller.enqueue({
                      type: 'text-delta',
                      id: 'partial-2',
                      delta: 'Second step partial',
                    });

                    abort.signal.addEventListener(
                      'abort',
                      () => controller.error(abort.signal.reason),
                      {
                        once: true,
                      },
                    );
                  },
                }),
        }),
    });

    const result = await streamMessage(agent, {
      req,
      chatId: 'chat-1',
      prompt: 'Find it',
      abortSignal: abort.signal,
    });

    for await (const part of result.stream) {
      if (part.type === 'text-delta') abort.abort();
    }

    await result.persistence;

    expect(messages).toHaveLength(2);
    expect(messages[1].parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text', text: 'Second step partial' }),
        expect.objectContaining({
          type: 'tool-lookup',
          state: 'output-available',
          output: { found: true },
        }),
      ]),
    );
  });

  it('checkpoints each step and persists every tool result and total token usage', async () => {
    let step = 0;
    let checkpoint: StoredMessage[] = [];

    const { agent, messages, req } = setup({
      tools: [
        {
          slug: 'lookup',
          description: 'Look up data',
          inputSchema: z.object({}),
          execute: () => ({ found: true }),
        },
      ],
      doStream: () => {
        if (step > 0) checkpoint = structuredClone(messages);

        return Promise.resolve({
          stream: modelStream(
            step++ === 0
              ? [
                  ...response('Checking').slice(0, -1),
                  { type: 'tool-call', toolCallId: 'call-1', toolName: 'lookup', input: '{}' },
                  {
                    type: 'finish',
                    finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                    usage,
                  },
                ]
              : response('Found it'),
          ),
        });
      },
    });

    const result = await streamMessage(agent, { req, chatId: 'chat-1', prompt: 'Find it' });

    await result.persistence;

    expect(checkpoint[1]?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text', text: 'Checking' }),
        expect.objectContaining({ type: 'tool-lookup', state: 'output-available' }),
      ]),
    );
    expect(messages).toHaveLength(2);
    expect(messages[1].parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text', text: 'Checking' }),
        expect.objectContaining({ type: 'text', text: 'Found it' }),
        expect.objectContaining({
          type: 'tool-lookup',
          state: 'output-available',
          output: { found: true },
        }),
      ]),
    );
    expect(messages[1]).toMatchObject({
      usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
    });
  });

  it('never offers a denied tool, and a call to it is invalid and never runs', async () => {
    const execute = vi.fn(() => ({ refunded: true }));
    const access = vi.fn(() => false);
    let step = 0;

    const { agent, model, req } = setup({
      tools: [
        lookup,
        { slug: 'refund', description: 'Refund', inputSchema: z.object({}), execute, access },
      ],
      doStream: () =>
        Promise.resolve({
          stream: modelStream(
            step++ === 0
              ? [
                  { type: 'stream-start', warnings: [] },
                  { type: 'tool-call', toolCallId: 'call-1', toolName: 'refund', input: '{}' },
                  {
                    type: 'finish',
                    finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                    usage,
                  },
                ]
              : response('Done'),
          ),
        }),
    });

    const result = await agent.aiAgent.stream({ prompt: 'Refund it', options: { req } });
    const parts = await Array.fromAsync(result.fullStream);

    expect(model.doStreamCalls).toHaveLength(2);
    expect(model.doStreamCalls.map(({ tools }) => tools?.map(({ name }) => name))).toEqual([
      ['lookup'],
      ['lookup'],
    ]);
    expect(parts).toContainEqual(
      expect.objectContaining({ type: 'tool-call', toolName: 'refund', invalid: true }),
    );
    expect(execute).not.toHaveBeenCalled();
    expect(access).toHaveBeenCalledOnce();
  });

  it('checks a rule once per run when a steered message joins a later step', async () => {
    const access = vi.fn(() => Promise.resolve(true));

    const { agent, model, req } = setup({
      tools: [
        lookup,
        {
          slug: 'refund',
          description: 'Refund',
          inputSchema: z.object({}),
          execute: () => 'refunded',
          access,
        },
      ],
      doStream: toolLoopStream(),
    });

    turn.promoteSteerMessages.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        message: { id: 'steer-1', role: 'user', parts: [{ type: 'text', text: 'Also refund' }] },
        selection: {},
      },
    ]);

    const result = await agent.aiAgent.stream({
      prompt: 'Find it',
      options: { req, chatId: 'chat-1' },
    });

    await Array.fromAsync(result.fullStream);

    expect(model.doStreamCalls.map(({ tools }) => tools?.map(({ name }) => name))).toEqual([
      ['lookup', 'refund'],
      ['lookup', 'refund'],
    ]);
    expect(access).toHaveBeenCalledOnce();
  });

  it('checks a rule once more on the run that resumes an approved call', async () => {
    const execute = vi.fn(() => 'refunded');
    const access = vi.fn(() => true);

    const { agent, req } = setup({
      tools: [
        {
          slug: 'refund',
          description: 'Refund',
          inputSchema: z.object({}),
          execute,
          approval: 'ask',
          access,
        },
      ],
    });

    const result = await agent.aiAgent.stream({
      messages: [
        { role: 'user', content: 'Refund it' },
        {
          role: 'assistant',
          content: [
            { type: 'tool-call', toolCallId: 'call-1', toolName: 'refund', input: {} },
            { type: 'tool-approval-request', approvalId: 'approval-1', toolCallId: 'call-1' },
          ],
        },
        {
          role: 'tool',
          content: [{ type: 'tool-approval-response', approvalId: 'approval-1', approved: true }],
        },
      ],
      options: { req, clientTools: { kinds: [], approval: true } },
    });

    await Array.fromAsync(result.fullStream);

    expect(access).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
  });

  it.each([
    ['an approval tool', 'ask' as const],
    ['a tool without approval', undefined],
  ])(
    'never runs an approved call to a denied tool carried in from history, for %s',
    async (_, approval) => {
      const execute = vi.fn(() => 'refunded');

      const { agent, req } = setup({
        tools: [
          {
            slug: 'refund',
            description: 'Refund',
            inputSchema: z.object({}),
            execute,
            ...(approval ? { approval } : {}),
            access: () => false,
          },
        ],
      });

      const result = await agent.aiAgent.stream({
        messages: [
          { role: 'user', content: 'Refund it' },
          {
            role: 'assistant',
            content: [
              { type: 'tool-call', toolCallId: 'call-1', toolName: 'refund', input: {} },
              { type: 'tool-approval-request', approvalId: 'approval-1', toolCallId: 'call-1' },
            ],
          },
          {
            role: 'tool',
            content: [{ type: 'tool-approval-response', approvalId: 'approval-1', approved: true }],
          },
        ],
        options: { req, clientTools: { kinds: [], approval: true } },
      });

      const parts = await Array.fromAsync(result.fullStream);

      expect(execute).not.toHaveBeenCalled();
      expect(parts).toContainEqual(
        expect.objectContaining({ type: 'tool-output-denied', toolCallId: 'call-1' }),
      );
    },
  );

  it('queues the message without calling the model while another turn is running', async () => {
    turn.claimTurn.mockResolvedValue(undefined);

    const { agent, messages, model, req } = setup();

    const result = await agent.streamMessage({
      req,
      chatId: 'chat-1',
      prompt: 'Also this',
      delivery: 'steer',
    });

    expect(result).toEqual({
      status: 'queued',
      chatId: 'chat-1',
      messageId: messages[0]?.id,
      delivery: 'steer',
    });
    expect(messages).toEqual([
      expect.objectContaining({ role: 'user', status: 'queued', delivery: 'steer' }),
    ]);
    expect(model.doStreamCalls).toEqual([]);
  });

  it('releases the turn and promotes the next queued message once the reply is persisted', async () => {
    const { agent, chat, req } = setup();

    const result = await streamMessage(agent, { req, chatId: 'chat-1', prompt: 'Hello' });

    await result.persistence;

    expect(turn.releaseTurn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ claim, state: 'idle' }),
    );
    expect(turn.promoteQueuedMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ chatId: 'chat-1' }),
    );
    expect(chat.lastMessageAt).toEqual(expect.any(String));
  });

  it('leaves the turn awaiting input when a client tool call is pending', async () => {
    const { agent, messages, req } = setup({
      tools: [question],
      doStream: () =>
        Promise.resolve({
          stream: modelStream([
            { type: 'stream-start', warnings: [] },
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'question',
              input: JSON.stringify({
                questions: [{ header: 'Size', question: 'Which size?', options: [{ label: 'S' }] }],
              }),
            },
            { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage },
          ]),
        }),
    });

    const result = await streamMessage(agent, {
      req,
      chatId: 'chat-1',
      prompt: 'Order a shirt',
      clientTools: { kinds: ['question'] },
    });

    await result.persistence;

    expect(turn.releaseTurn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ claim, state: 'awaiting' }),
    );
    expect(turn.promoteQueuedMessage).not.toHaveBeenCalled();
    expect(messages[1]?.parts).toContainEqual(
      expect.objectContaining({ type: 'tool-question', state: 'input-available' }),
    );
  });
});

describe('agent model and reasoning selection with the installed AI SDK', () => {
  beforeEach(() => {
    turn.claimTurn.mockReset().mockResolvedValue(claim);

    turn.holdTurn
      .mockReset()
      .mockReturnValue({ signal: new AbortController().signal, stop: vi.fn() });

    turn.promoteQueuedMessage.mockReset();
    turn.promoteSteerMessages.mockReset().mockResolvedValue([]);
    turn.releaseTurn.mockReset().mockResolvedValue(true);
  });

  it('rejects a model blocked for the turn user before any model call', async () => {
    const { agent, calls, finish, req } = setup({
      model: LOCAL_THINKER,
      options: [LOCAL_WRITER],
      allowed: [LOCAL_WRITER],
    });

    await expect(
      agent.aiAgent.stream({
        prompt: 'Hello',
        options: { req, selection: { model: LOCAL_THINKER } },
      }),
    ).rejects.toMatchObject({
      code: 'selection-unavailable',
      status: 409,
      message: "Model 'local/thinker' is not allowed for this user",
    });

    expect(calls).toEqual([]);
    expect(finish).not.toHaveBeenCalled();
  });

  it('stops at the next step when a steer model is blocked for the turn author', async () => {
    const { agent, calls, req } = setup({
      model: LOCAL_THINKER,
      options: [LOCAL_WRITER],
      allowed: [LOCAL_THINKER],
      tools: [lookup],
      doStream: toolLoopStream(),
    });

    turn.promoteSteerMessages.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        message: { id: 'steer-1', role: 'user', parts: [{ type: 'text', text: 'Write it up' }] },
        selection: { model: LOCAL_WRITER },
      },
    ]);

    const result = await agent.aiAgent.stream({
      prompt: 'Find it',
      options: { req, chatId: 'chat-1' },
    });

    const parts = await Array.fromAsync(result.fullStream);
    const errors = parts.filter((part) => part.type === 'error').map((part) => part.error);

    expect(errors).toEqual([
      expect.objectContaining({
        code: 'selection-unavailable',
        message: "Model 'local/writer' is not allowed for this user",
      }),
    ]);
    expect(calls).toEqual([{ model: LOCAL_THINKER, providerOptions: undefined }]);
  });

  it('runs and persists the user fallback when the turn names no model', async () => {
    const { agent, calls, messages, req } = setup({
      model: LOCAL_THINKER,
      options: [LOCAL_WRITER],
      allowed: [LOCAL_WRITER],
    });

    const result = await streamMessage(agent, { req, chatId: 'chat-1', prompt: 'Hello' });

    await result.persistence;

    expect(calls).toEqual([{ model: LOCAL_WRITER, providerOptions: undefined }]);
    expect(messages[1]).toMatchObject({
      usage: { model: LOCAL_WRITER, provider: 'local', totalTokens: 3 },
    });
  });

  it('runs and persists the agent default when the turn has no user', async () => {
    const { agent, calls, chat, messages, req } = setup({
      model: LOCAL_THINKER,
      options: [LOCAL_WRITER],
      user: null,
    });

    const channelAccess = createChannelChatAccess({
      req,
      agentSlug: agent.slug,
      chatId: chat.id,
      channelKey: chat.channelKey,
    });

    const result = await streamMessage(agent, {
      req,
      chatId: chat.id,
      prompt: 'Hello',
      channelAccess,
    });

    await result.persistence;

    expect(calls).toEqual([{ model: LOCAL_THINKER, providerOptions: undefined }]);
    expect(messages[1]).toMatchObject({
      usage: { model: LOCAL_THINKER, provider: 'local', totalTokens: 3 },
    });
  });

  it('sends the selected variant on every step of a streamed tool loop', async () => {
    const { agent, calls, req } = setup({
      model: LOCAL_THINKER,
      tools: [lookup],
      doStream: toolLoopStream(),
    });

    const result = await agent.aiAgent.stream({
      prompt: 'Find it',
      options: { req, selection: { reasoning: 'high' } },
    });

    await result.consumeStream();

    expect(calls).toEqual([
      { model: LOCAL_THINKER, providerOptions: { local: { reasoningEffort: 'high' } } },
      { model: LOCAL_THINKER, providerOptions: { local: { reasoningEffort: 'high' } } },
    ]);
  });

  it('sends the selected model and variant on every step of a generated tool loop', async () => {
    const { agent, calls, req } = setup({
      options: [LOCAL_WRITER],
      tools: [lookup],
      doGenerate: toolLoopGenerate(),
    });

    await agent.aiAgent.generate({
      prompt: 'Find it',
      options: { req, selection: { model: LOCAL_WRITER, reasoning: 'max' } },
    });

    expect(calls).toEqual([
      { model: LOCAL_WRITER, providerOptions: { local: { reasoningEffort: 'max' } } },
      { model: LOCAL_WRITER, providerOptions: { local: { reasoningEffort: 'max' } } },
    ]);
  });

  it('sends no reasoning options when no option is selected', async () => {
    const { agent, calls, req } = setup({
      model: LOCAL_THINKER,
      tools: [lookup],
      doStream: toolLoopStream(),
    });

    const result = await agent.aiAgent.stream({ prompt: 'Find it', options: { req } });

    await result.consumeStream();

    expect(calls).toEqual([
      { model: LOCAL_THINKER, providerOptions: undefined },
      { model: LOCAL_THINKER, providerOptions: undefined },
    ]);
  });

  it('switches to a steer message model and variant from the next step', async () => {
    const { agent, calls, req } = setup({
      model: LOCAL_THINKER,
      options: [LOCAL_WRITER],
      tools: [lookup],
      doStream: toolLoopStream(),
    });

    turn.promoteSteerMessages.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        message: { id: 'steer-1', role: 'user', parts: [{ type: 'text', text: 'Write it up' }] },
        selection: { model: LOCAL_WRITER, reasoning: 'max' },
      },
    ]);

    const result = await agent.aiAgent.stream({
      prompt: 'Find it',
      options: { req, chatId: 'chat-1', selection: { reasoning: 'high' } },
    });

    await result.consumeStream();

    expect(calls).toEqual([
      { model: LOCAL_THINKER, providerOptions: { local: { reasoningEffort: 'high' } } },
      { model: LOCAL_WRITER, providerOptions: { local: { reasoningEffort: 'max' } } },
    ]);
  });

  it('drops the previous variant when a steer message selects none', async () => {
    const { agent, calls, req } = setup({
      model: LOCAL_THINKER,
      tools: [lookup],
      doStream: toolLoopStream(),
    });

    turn.promoteSteerMessages.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        message: { id: 'steer-1', role: 'user', parts: [{ type: 'text', text: 'Quickly' }] },
        selection: {},
      },
    ]);

    const result = await agent.aiAgent.stream({
      prompt: 'Find it',
      options: { req, chatId: 'chat-1', selection: { reasoning: 'high' } },
    });

    await result.consumeStream();

    expect(calls).toEqual([
      { model: LOCAL_THINKER, providerOptions: { local: { reasoningEffort: 'high' } } },
      { model: LOCAL_THINKER, providerOptions: undefined },
    ]);
  });

  it.each([
    [{ reasoning: 'max' }, "Reasoning option 'max' is not available for model 'local/thinker'"],
    [{ model: LOCAL_WRITER }, "Model 'local/writer' is not allowed for agent 'support'"],
  ] as const)(
    'stops before the next model call when steer selection %o is unavailable',
    async (selection, message) => {
      const { agent, calls, req } = setup({
        model: LOCAL_THINKER,
        tools: [lookup],
        doStream: toolLoopStream(),
      });

      turn.promoteSteerMessages.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          message: { id: 'steer-1', role: 'user', parts: [{ type: 'text', text: 'Harder' }] },
          selection,
        },
      ]);

      const result = await agent.aiAgent.stream({
        prompt: 'Find it',
        options: { req, chatId: 'chat-1' },
      });

      const parts = await Array.fromAsync(result.fullStream);
      const errors = parts.filter((part) => part.type === 'error').map((part) => part.error);

      expect(errors).toEqual([
        expect.objectContaining({
          code: 'selection-unavailable',
          message,
        }),
      ]);
      expect(calls).toHaveLength(1);
    },
  );

  it('rejects an unavailable selection before any model call', async () => {
    const { agent, calls, finish, req } = setup({ model: LOCAL_THINKER });

    await expect(
      agent.aiAgent.stream({
        prompt: 'Hello',
        options: { req, selection: { model: LOCAL_WRITER } },
      }),
    ).rejects.toMatchObject({
      code: 'selection-unavailable',
      status: 409,
      message: "Model 'local/writer' is not allowed for agent 'support'",
    });

    expect(calls).toEqual([]);
    expect(finish).not.toHaveBeenCalled();
  });

  it('logs usage against the model that ran each step', async () => {
    const { agent, frogbot, req } = setup({
      model: LOCAL_THINKER,
      options: [LOCAL_WRITER],
      tools: [lookup],
      doStream: toolLoopStream(),
    });

    turn.promoteSteerMessages.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        message: { id: 'steer-1', role: 'user', parts: [{ type: 'text', text: 'Write it up' }] },
        selection: { model: LOCAL_WRITER },
      },
    ]);

    const result = await agent.aiAgent.stream({
      prompt: 'Find it',
      options: { req, chatId: 'chat-1' },
    });

    await result.consumeStream();

    await vi.waitFor(() => {
      expect(
        frogbot.create.mock.calls
          .map(([args]) => args)
          .filter(({ collection }) => collection === 'usage-logs')
          .map(({ data }) => data.model),
      ).toEqual([LOCAL_THINKER, LOCAL_WRITER]);
    });
  });
});

describe('structured agent runs with the installed AI SDK', () => {
  const triage = Output.object({
    schema: z.object({ priority: z.enum(['low', 'high']), team: z.string() }),
  });

  const answer = '{"priority":"high","team":"billing"}';
  const json = expect.objectContaining({
    type: 'json',
    schema: expect.objectContaining({ required: ['priority', 'team'] }),
  });

  const usageRows = (frogbot: ReturnType<typeof setup>['frogbot']) =>
    frogbot.create.mock.calls.filter(([{ collection }]) => collection === 'usage-logs');

  beforeEach(() => {
    turn.claimTurn.mockReset().mockResolvedValue(claim);

    turn.holdTurn
      .mockReset()
      .mockReturnValue({ signal: new AbortController().signal, stop: vi.fn() });

    turn.promoteQueuedMessage.mockReset();
    turn.promoteSteerMessages.mockReset().mockResolvedValue([]);
    turn.releaseTurn.mockReset().mockResolvedValue(true);
  });

  it.each([
    ['a new chat', undefined, 'chat-2'],
    ['the given chat', 'chat-1', 'chat-1'],
  ])(
    'returns the parsed object from a tool loop and saves the reply as text in %s',
    async (_, chatId, saved) => {
      const execute = vi.fn(() => ({ found: true }));
      const { agent, finish, formats, frogbot, messages, req } = setup({
        tools: [{ ...lookup, execute }],
        doGenerate: toolLoopGenerate(answer),
      });

      const result = await agent.generate({ prompt: 'Classify', req, chatId, output: triage });

      expect(result.output).toEqual({ priority: 'high', team: 'billing' });
      expect(execute).toHaveBeenCalledOnce();
      expect(formats).toEqual([json, json]);
      expect(finish).toHaveBeenCalledOnce();
      expect(usageRows(frogbot)).toHaveLength(2);
      expect(
        frogbot.create.mock.calls.filter(([{ collection }]) => collection === 'chats'),
      ).toHaveLength(chatId === undefined ? 1 : 0);
      expect(messages.map(({ chat, role }) => [chat, role])).toEqual([
        [saved, 'user'],
        [saved, 'assistant'],
      ]);
      expect(messages[1].parts).toContainEqual(expect.objectContaining({ text: answer }));
    },
  );

  it('throws NoOutputGeneratedError on reading output when stopWhen ends on a tool step', async () => {
    const { agent, formats, req } = setup({
      tools: [lookup],
      doGenerate: toolLoopGenerate(answer),
      stopWhen: isStepCount(1),
    });

    const result = await agent.generate({ prompt: 'Classify', req, output: triage });

    expect(formats).toEqual([json]);
    expect(() => result.output).toThrow(NoOutputGeneratedError);
  });

  it('rejects a structured stream that ends on a tool step with NoObjectGeneratedError', async () => {
    const { agent, finish, req } = setup({
      tools: [lookup],
      doStream: toolLoopStream(answer),
      stopWhen: isStepCount(1),
    });

    const result = await agent.stream({ prompt: 'Classify', req, output: triage });

    await expect(result.output).rejects.toMatchObject({
      name: 'AI_NoObjectGeneratedError',
      finishReason: 'tool-calls',
    });

    await vi.waitFor(() => {
      expect(finish).toHaveBeenCalledOnce();
    });
  });

  it('rejects with NoObjectGeneratedError when the answer fails the schema', async () => {
    const { agent, finish, messages, req } = setup({
      tools: [lookup],
      doGenerate: toolLoopGenerate('{"priority":"urgent"}'),
    });

    await expect(agent.generate({ prompt: 'Classify', req, output: triage })).rejects.toSatisfy(
      NoObjectGeneratedError.isInstance,
    );
    expect(finish).toHaveBeenCalledExactlyOnceWith({ error: expect.any(NoObjectGeneratedError) });
    expect(messages.map(({ role }) => role)).toEqual(['user']);
  });

  it('logs usage for every step when the answer fails the schema', async () => {
    const { agent, frogbot, req } = setup({
      tools: [lookup],
      doGenerate: toolLoopGenerate('{"priority":"urgent"}'),
    });

    await expect(agent.generate({ prompt: 'Classify', req, output: triage })).rejects.toSatisfy(
      NoObjectGeneratedError.isInstance,
    );

    expect(usageRows(frogbot)).toHaveLength(2);
  });

  it('still calls the caller onEnd of an aiAgent generate once', async () => {
    const onEnd = vi.fn();
    const { agent, frogbot, req } = setup({ tools: [lookup], doGenerate: toolLoopGenerate() });

    const result = await agent.aiAgent.generate({ prompt: 'Find it', options: { req }, onEnd });

    expect(result.text).toBe('Found it');
    expect(onEnd).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ steps: expect.arrayContaining([expect.anything()]) }),
    );
    expect(usageRows(frogbot)).toHaveLength(2);
  });

  const refund = (overrides: Partial<AnyTool> = {}): AnyTool => ({
    slug: 'refund',
    description: 'Refund',
    inputSchema: z.object({}),
    execute: () => 'refunded',
    approval: 'ask',
    ...overrides,
  });

  const approvedHistory = [
    { role: 'user' as const, content: 'Refund it' },
    {
      role: 'assistant' as const,
      content: [
        { type: 'tool-call' as const, toolCallId: 'call-1', toolName: 'refund', input: {} },
        { type: 'tool-approval-request' as const, approvalId: 'approval-1', toolCallId: 'call-1' },
      ],
    },
    {
      role: 'tool' as const,
      content: [
        { type: 'tool-approval-response' as const, approvalId: 'approval-1', approved: true },
      ],
    },
  ];

  it.each([
    [true, 1],
    [false, 0],
  ])(
    'resumes an approved call from history on a structured stream as a plain one, autoApprove %s',
    async (autoApprove, ran) => {
      const run = async (output?: typeof triage) => {
        const execute = vi.fn(() => 'refunded');
        const access = vi.fn(() => true);
        const { agent, formats, req } = setup({
          tools: [refund({ execute, access })],
          doStream: () => Promise.resolve({ stream: modelStream(response(answer)) }),
        });

        const result = await agent.stream({ messages: approvedHistory, req, autoApprove, output });
        const parts = await Array.fromAsync(result.fullStream);

        return {
          tools: parts.filter(({ type }) => type.startsWith('tool')),
          executed: execute.mock.calls.length,
          checked: access.mock.calls.length,
          formats,
          output: output ? await result.output : undefined,
        };
      };

      const [plain, structured] = [await run(), await run(triage)];

      expect(structured.tools).toEqual(plain.tools);
      expect(structured.executed).toBe(ran);
      expect(plain.executed).toBe(ran);
      expect(structured.checked).toBe(1);
      expect(structured.formats).toEqual([json]);
      expect(structured.output).toEqual({ priority: 'high', team: 'billing' });
    },
  );

  it.each([
    ['an approval tool', 'ask' as const],
    ['a tool without approval', undefined],
  ])(
    'never runs an approved call to a denied tool from history on a structured stream, for %s',
    async (_, approval) => {
      const execute = vi.fn(() => 'refunded');
      const { agent, calls, req } = setup({
        tools: [refund({ execute, approval, access: () => false })],
        doStream: () => Promise.resolve({ stream: modelStream(response(answer)) }),
      });

      const result = await agent.stream({ messages: approvedHistory, req, output: triage });
      const parts = await Array.fromAsync(result.fullStream);

      expect(execute).not.toHaveBeenCalled();
      expect(parts).toContainEqual(
        expect.objectContaining({ type: 'tool-output-denied', toolCallId: 'call-1' }),
      );
      await expect(result.output).resolves.toEqual({ priority: 'high', team: 'billing' });
      expect(calls).toHaveLength(1);
    },
  );

  it.each([
    [true, 'refunded'],
    [false, undefined],
  ])('applies approval to a structured generate with autoApprove %s', async (autoApprove, ran) => {
    const execute = vi.fn(() => 'refunded');
    const { agent, model, req } = setup({
      tools: [refund({ execute })],
      doGenerate: toolLoopGenerate(answer, 'refund'),
    });

    const result = await agent.generate({ prompt: 'Refund', req, autoApprove, output: triage });

    expect(result.output).toEqual({ priority: 'high', team: 'billing' });
    expect(execute).toHaveBeenCalledTimes(ran ? 1 : 0);
    expect(model.doGenerateCalls[1].prompt.at(-1)).toMatchObject({
      role: 'tool',
      content: [
        ran
          ? expect.objectContaining({ output: { type: 'text', value: 'refunded' } })
          : expect.objectContaining({
              output: expect.objectContaining({ type: 'execution-denied', reason: NOT_APPROVABLE }),
            }),
      ],
    });
  });

  it.each([
    [true, ['lookup', 'refund'], 0, { type: 'json', value: { trusted: true } }],
    [
      false,
      ['lookup'],
      1,
      { type: 'error-text', value: expect.stringContaining("unavailable tool 'refund'") },
    ],
  ])(
    'gives a structured run with overrideAccess %s the tool access of a plain run',
    async (overrideAccess, offered, checks, toolOutput) => {
      const execute = vi.fn((_input: unknown, ctx: ToolCtx) => ({ trusted: ctx.overrideAccess }));
      const access = vi.fn(() => false);
      const { agent, model, req } = setup({
        tools: [lookup, refund({ execute, approval: undefined, access })],
        doGenerate: toolLoopGenerate(answer, 'refund'),
      });

      const result = await agent.generate({
        prompt: 'Refund',
        req,
        overrideAccess,
        output: triage,
      });

      expect(result.output).toEqual({ priority: 'high', team: 'billing' });
      expect(model.doGenerateCalls[0].tools?.map(({ name }) => name)).toEqual(offered);
      expect(access).toHaveBeenCalledTimes(checks);
      expect(model.doGenerateCalls[1].prompt.at(-1)).toMatchObject({
        role: 'tool',
        content: [expect.objectContaining({ output: toolOutput })],
      });
    },
  );

  it('streams a tool loop to the parsed object and finishes the operation once', async () => {
    const execute = vi.fn(() => ({ found: true }));
    const { agent, finish, formats, frogbot, messages, req } = setup({
      tools: [{ ...lookup, execute }],
      doStream: toolLoopStream(answer),
    });

    const result = await agent.stream({ prompt: 'Classify', req, output: triage });

    await expect(result.output).resolves.toEqual({ priority: 'high', team: 'billing' });

    await vi.waitFor(() => {
      expect(finish).toHaveBeenCalledOnce();
    });

    expect(finish).toHaveBeenCalledWith(expect.objectContaining({ finishReason: 'stop' }));
    expect(execute).toHaveBeenCalledOnce();
    expect(formats).toEqual([json, json]);
    expect(usageRows(frogbot)).toHaveLength(2);
    expect(messages).toEqual([]);
  });

  it('finishes an aborted structured stream once', async () => {
    const abort = new AbortController();
    const { agent, finish, req } = setup({
      doStream: () =>
        Promise.resolve({
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(controller) {
              controller.enqueue({ type: 'stream-start', warnings: [] });
              controller.enqueue({ type: 'text-start', id: 'text-1' });
              controller.enqueue({ type: 'text-delta', id: 'text-1', delta: '{"prio' });

              abort.signal.addEventListener('abort', () => controller.error(abort.signal.reason), {
                once: true,
              });
            },
          }),
        }),
    });

    const result = await agent.stream({
      prompt: 'Classify',
      req,
      output: triage,
      abortSignal: abort.signal,
    });

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') abort.abort();
    }

    await expect(result.output).rejects.toThrow();

    await vi.waitFor(() => {
      expect(finish).toHaveBeenCalled();
    });

    expect(finish).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ finishReason: 'abort' }),
    );
  });

  it.each(['generate', 'stream'] as const)(
    'refuses a structured %s with 403 before any model call',
    async (entry) => {
      const access = vi.fn(() => false);
      const { agent, calls, finish, messages, req } = setup({ access });

      await expect(
        agent[entry]({ prompt: 'Classify', req, overrideAccess: false, output: triage }),
      ).rejects.toMatchObject({ status: 403 });

      expect(access).toHaveBeenCalledOnce();
      expect(calls).toEqual([]);
      expect(finish).not.toHaveBeenCalled();
      expect(messages).toEqual([]);
    },
  );
});

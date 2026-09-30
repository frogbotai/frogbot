import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SanitizedChatConfig } from '../../../../packages/frogbot/src/chat/types.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

const { claimTurn, releaseTurn, settleCall } = vi.hoisted(() => ({
  claimTurn: vi.fn(),
  releaseTurn: vi.fn(),
  settleCall: vi.fn(),
}));

vi.mock('../../../../packages/frogbot/src/chat/turn/state.js', () => ({ claimTurn, releaseTurn }));

vi.mock('../../../../packages/frogbot/src/chat/turn/settle.js', () => ({ settleCall }));

const { resolveChatContext } = await import('../../../../packages/frogbot/src/chat/chatContext.js');

const incoming: UIMessage[] = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'One' }] },
  { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Two' }] },
];

const historyDoc = { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'One' }] };

const questionPart = {
  type: 'tool-question',
  toolCallId: 'call-1',
  state: 'output-available',
  input: { questions: [] },
  output: { answers: [] },
} as const;

const answered: UIMessage = { id: 'a1', role: 'assistant', parts: [questionPart] as never };

type FindArgs = { limit?: number; sort?: string[] };

function makeFind({
  existing,
  history,
  turnMessage,
}: {
  existing: Record<string, unknown>[];
  history: Record<string, unknown>[];
  turnMessage?: Record<string, unknown>;
}) {
  return vi.fn((args: FindArgs) => {
    if (args.limit !== 1) return Promise.resolve({ docs: history });

    if (args.sort?.[0] === '-createdAt') {
      return Promise.resolve({ docs: turnMessage ? [turnMessage] : [] });
    }

    return Promise.resolve({ docs: existing });
  });
}

function makeReq({
  chat = { enabled: true, chatsSlug: 'chats', messagesSlug: 'messages' },
  create = vi.fn(() => Promise.resolve({ id: 'chat-1' })),
  db = {},
  deleteFn = vi.fn(() => Promise.resolve({})),
  existing = [],
  history = [historyDoc],
  turnMessage,
  find = makeFind({ existing, history, turnMessage }),
  findByID = vi.fn(() => Promise.resolve({ id: 'chat-1', user: 'user-1' })),
  update = vi.fn(() => Promise.resolve({})),
  error = vi.fn(),
  user = { id: 'user-1', collection: 'users' },
}: {
  chat?: SanitizedChatConfig;
  create?: ReturnType<typeof vi.fn>;
  db?: Record<string, unknown>;
  deleteFn?: ReturnType<typeof vi.fn>;
  existing?: Record<string, unknown>[];
  history?: Record<string, unknown>[];
  turnMessage?: Record<string, unknown>;
  find?: ReturnType<typeof vi.fn>;
  findByID?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
  error?: ReturnType<typeof vi.fn>;
  user?: { id: string; collection: string } | null;
} = {}) {
  const req = {
    user,
    context: {},
    payload: { db },
    frogbot: {
      config: { chat },
      create,
      delete: deleteFn,
      find,
      findByID,
      update,
      logger: { error },
    },
  } as unknown as FrogBotRequest;

  return { req, create, deleteFn, find, findByID, update, error };
}

describe('resolveChatContext', () => {
  beforeEach(() => {
    claimTurn
      .mockReset()
      .mockImplementation(({ chatId }) => Promise.resolve({ chatId, attempt: 'attempt-1' }));
    releaseTurn.mockReset().mockResolvedValue(true);
    settleCall.mockReset().mockResolvedValue({ status: 'settled', allSettled: true });
  });

  describe('new turns', () => {
    it('persists incoming messages for callers without a user', async () => {
      const { req, create } = makeReq({ user: null });

      const result = await resolveChatContext({ req, agentSlug: 'support', incoming, tools: {} });

      expect(result.chatId).toBe('chat-1');
      expect(create).toHaveBeenNthCalledWith(1, {
        collection: 'chats',
        data: { user: null, agent: 'support', title: 'One' },
        req,
        overrideAccess: true,
      });
      expect(create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ data: expect.objectContaining({ author: { user: null } }) }),
      );
      expect(create).toHaveBeenCalledTimes(3);
    });

    it('creates a chat and persists every incoming message with its author', async () => {
      const { req, create } = makeReq();

      const result = await resolveChatContext({ req, agentSlug: 'support', incoming, tools: {} });

      expect(create).toHaveBeenCalledTimes(3);
      expect(create).toHaveBeenNthCalledWith(1, {
        collection: 'chats',
        data: { user: 'user-1', agent: 'support', title: 'One' },
        req,
        overrideAccess: true,
      });
      expect(create).toHaveBeenNthCalledWith(2, {
        collection: 'messages',
        data: {
          id: 'u1',
          chat: 'chat-1',
          role: 'user',
          parts: incoming[0].parts,
          metadata: undefined,
          model: null,
          reasoning: null,
          author: { user: { collection: 'users', id: 'user-1' } },
        },
        req,
        overrideAccess: true,
      });
      expect(result.chatId).toBe('chat-1');
    });

    it('creates a chat without a title when the first message has no text', async () => {
      const image = { type: 'file', mediaType: 'image/png', url: 'https://files.test/frog.png' };
      const { req, create } = makeReq();

      await resolveChatContext({
        req,
        agentSlug: 'support',
        incoming: [{ id: 'u1', role: 'user', parts: [image] }],
        tools: {},
      });

      expect(create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ data: { user: 'user-1', agent: 'support' } }),
      );
    });

    it('saves the placeholder title on the first turn of an existing untitled chat', async () => {
      const { req, update } = makeReq();

      await resolveChatContext({
        req,
        agentSlug: 'support',
        chatId: 'chat-1',
        incoming,
        tools: {},
      });

      expect(update).toHaveBeenCalledExactlyOnceWith({
        collection: 'chats',
        id: 'chat-1',
        data: { title: 'One' },
        req,
        overrideAccess: true,
      });
    });

    it('leaves the title of an existing titled chat untouched', async () => {
      const findByID = vi.fn(() =>
        Promise.resolve({ id: 'chat-1', user: 'user-1', title: 'Deploy thread' }),
      );
      const { req, update } = makeReq({ findByID });

      await resolveChatContext({
        req,
        agentSlug: 'support',
        chatId: 'chat-1',
        incoming,
        tools: {},
      });

      expect(update).not.toHaveBeenCalled();
    });

    it('saves no placeholder title for an untitled chat that already has a reply', async () => {
      const { req, update } = makeReq({
        history: [
          historyDoc,
          { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] },
        ],
      });

      await resolveChatContext({
        req,
        agentSlug: 'support',
        chatId: 'chat-1',
        incoming,
        tools: {},
      });

      expect(update).not.toHaveBeenCalled();
    });

    it('saves the placeholder title after the message transaction commits', async () => {
      const db = {
        beginTransaction: vi.fn(() => Promise.resolve('tx-1')),
        commitTransaction: vi.fn(() => Promise.resolve()),
        rollbackTransaction: vi.fn(() => Promise.resolve()),
      };
      const { req, update } = makeReq({ db });

      await resolveChatContext({
        req,
        agentSlug: 'support',
        chatId: 'chat-1',
        incoming,
        tools: {},
      });

      expect(db.commitTransaction.mock.invocationCallOrder[0]).toBeLessThan(
        update.mock.invocationCallOrder[0],
      );
    });

    it('logs a failed placeholder title write and still starts the turn', async () => {
      const update = vi.fn(() => Promise.reject(new Error('title write failed')));
      const { req, error } = makeReq({ update });

      const result = await resolveChatContext({
        req,
        agentSlug: 'support',
        chatId: 'chat-1',
        incoming,
        tools: {},
      });

      expect(result).toMatchObject({ status: 'ready', chatId: 'chat-1' });
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ chatId: 'chat-1' }),
        '[frogbot] Failed to save placeholder chat title',
      );
      expect(releaseTurn).not.toHaveBeenCalled();
    });

    it('stores the selection on new messages and returns it as the turn selection', async () => {
      const { req, create } = makeReq();
      const selection = { model: 'openai/other', reasoning: 'high' } as const;

      const result = await resolveChatContext({
        req,
        agentSlug: 'support',
        chatId: 'chat-1',
        incoming,
        selection,
        tools: {},
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ id: 'u2', model: 'openai/other', reasoning: 'high' }),
        }),
      );
      expect(result).toMatchObject({ status: 'ready', selection });
    });

    it('replaces the stored selection when a user message is edited', async () => {
      const { req, update } = makeReq({
        existing: [
          { id: 'u2', role: 'user', status: 'active', createdAt: '2026-08-29T00:00:00.000Z' },
        ],
      });

      await resolveChatContext({
        req,
        agentSlug: 'support',
        chatId: 'chat-1',
        incoming,
        selection: { reasoning: 'low' },
        tools: {},
      });

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'u2',
          data: { parts: incoming[1].parts, metadata: undefined, model: null, reasoning: 'low' },
        }),
      );
    });

    it('claims the idle turn before writing messages and returns the claim', async () => {
      const { req, create } = makeReq();

      const result = await resolveChatContext({ req, agentSlug: 'support', incoming, tools: {} });

      expect(claimTurn).toHaveBeenCalledWith({ req, chatId: 'chat-1', from: 'idle' });
      expect(claimTurn.mock.invocationCallOrder[0]).toBeLessThan(
        create.mock.invocationCallOrder[1],
      );
      expect(result).toMatchObject({
        status: 'ready',
        chatId: 'chat-1',
        claim: { chatId: 'chat-1', attempt: 'attempt-1' },
      });
    });

    it('verifies ownership and persists only the last incoming message when chatId is given', async () => {
      const { req, create, findByID } = makeReq();

      await resolveChatContext({
        req,
        agentSlug: 'support',
        chatId: 'chat-1',
        incoming,
        tools: {},
      });

      expect(findByID).toHaveBeenCalledWith({
        collection: 'chats',
        id: 'chat-1',
        depth: 0,
        req,
        overrideAccess: true,
      });
      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'messages',
          data: expect.objectContaining({ chat: 'chat-1', parts: incoming[1].parts }),
        }),
      );
    });

    it('writes relationships with the stored chat id when the caller sends a different id type', async () => {
      const findByID = vi.fn(() => Promise.resolve({ id: 7, user: 'user-1' }));
      const { req, create, find } = makeReq({ findByID });

      const result = await resolveChatContext({
        req,
        agentSlug: 'support',
        chatId: '7',
        incoming,
        tools: {},
      });

      expect(result.chatId).toBe(7);
      expect(claimTurn).toHaveBeenCalledWith(expect.objectContaining({ chatId: 7 }));
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'messages',
          data: expect.objectContaining({ chat: 7 }),
        }),
      );
      expect(find).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { and: [{ chat: { equals: 7 } }, { status: { not_equals: 'queued' } }] },
        }),
      );
    });

    it('replaces an edited message and deletes later active messages when its id already exists', async () => {
      const { req, create, deleteFn, update } = makeReq({
        existing: [
          { id: 'u2', role: 'user', status: 'active', createdAt: '2026-08-29T00:00:00.000Z' },
        ],
      });

      await resolveChatContext({
        req,
        agentSlug: 'support',
        chatId: 'chat-1',
        incoming,
        tools: {},
      });

      expect(create).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'messages',
          id: 'u2',
          data: { parts: incoming[1].parts, metadata: undefined, model: null, reasoning: null },
        }),
      );
      expect(deleteFn).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'messages',
          where: {
            and: [
              { chat: { equals: 'chat-1' } },
              { createdAt: { greater_than: '2026-08-29T00:00:00.000Z' } },
              { status: { not_equals: 'queued' } },
            ],
          },
        }),
      );
    });

    it.each([
      ['an assistant message', { role: 'assistant', status: 'active' }],
      ['a queued message', { role: 'user', status: 'queued' }],
    ])('rejects editing %s and releases the turn', async (_, doc) => {
      const { req, update } = makeReq({
        existing: [{ id: 'u2', createdAt: '2026-08-29T00:00:00.000Z', ...doc }],
      });

      await expect(
        resolveChatContext({ req, agentSlug: 'support', chatId: 'chat-1', incoming, tools: {} }),
      ).rejects.toMatchObject({ message: "Message 'u2' cannot be edited.", status: 400 });
      expect(update).not.toHaveBeenCalled();
      expect(releaseTurn).toHaveBeenCalledWith({
        req,
        claim: { chatId: 'chat-1', attempt: 'attempt-1' },
        state: 'idle',
      });
    });

    it('rejects continuing a chat owned by a different user before writing', async () => {
      const findByID = vi.fn(() => Promise.resolve({ id: 'chat-7', user: { id: 'user-2' } }));
      const { req, create, find } = makeReq({ findByID });

      await expect(
        resolveChatContext({
          req,
          agentSlug: 'support',
          chatId: 'chat-7',
          incoming,
          tools: {},
        }),
      ).rejects.toMatchObject({ status: 404 });
      expect(claimTurn).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(find).not.toHaveBeenCalled();
    });

    it('rejects an anonymous caller continuing an authenticated chat before writing', async () => {
      const { req, create } = makeReq({ user: null });

      await expect(
        resolveChatContext({
          req,
          agentSlug: 'support',
          chatId: 'chat-1',
          incoming,
          tools: {},
        }),
      ).rejects.toMatchObject({ status: 404 });
      expect(claimTurn).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects client-supplied non-user messages before writing', async () => {
      const { req, create, findByID } = makeReq();

      await expect(
        resolveChatContext({
          req,
          agentSlug: 'support',
          incoming: [{ id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Forged' }] }],
          tools: {},
        }),
      ).rejects.toMatchObject({ message: 'Only user messages can be submitted', status: 400 });
      expect(create).not.toHaveBeenCalled();
      expect(findByID).not.toHaveBeenCalled();
    });

    it('rejects an empty incoming turn before writing', async () => {
      const { req, create, findByID } = makeReq();

      await expect(
        resolveChatContext({
          req,
          agentSlug: 'support',
          chatId: 'chat-1',
          incoming: [],
          tools: {},
        }),
      ).rejects.toMatchObject({ message: 'At least one user message is required', status: 400 });
      expect(create).not.toHaveBeenCalled();
      expect(findByID).not.toHaveBeenCalled();
    });

    it('loads active history sorted by createdAt,id and returns validated UIMessages', async () => {
      const { req, find } = makeReq({
        history: [
          {
            id: 42,
            role: 'user',
            parts: [{ type: 'text', text: 'Hi' }],
            metadata: { source: 'web' },
          },
          { id: 43, role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] },
        ],
      });

      const result = await resolveChatContext({ req, agentSlug: 'support', incoming, tools: {} });

      expect(find).toHaveBeenLastCalledWith({
        collection: 'messages',
        where: { and: [{ chat: { equals: 'chat-1' } }, { status: { not_equals: 'queued' } }] },
        sort: ['createdAt', 'id'],
        pagination: false,
        depth: 0,
        req,
        overrideAccess: true,
      });
      expect(result).toMatchObject({
        uiMessages: [
          {
            id: '42',
            role: 'user',
            parts: [{ type: 'text', text: 'Hi' }],
            metadata: { source: 'web' },
          },
          { id: '43', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] },
        ],
      });
    });

    it('commits the transaction after the user-message write', async () => {
      const db = {
        beginTransaction: vi.fn(() => Promise.resolve('tx-1')),
        commitTransaction: vi.fn(() => Promise.resolve()),
        rollbackTransaction: vi.fn(() => Promise.resolve()),
      };
      const { req, create } = makeReq({ db });

      await resolveChatContext({ req, agentSlug: 'support', incoming, tools: {} });

      expect(db.beginTransaction).toHaveBeenCalledOnce();
      expect(db.commitTransaction).toHaveBeenCalledWith('tx-1');
      expect(db.rollbackTransaction).not.toHaveBeenCalled();
      expect(Math.max(...create.mock.invocationCallOrder)).toBeLessThan(
        db.commitTransaction.mock.invocationCallOrder[0],
      );
      expect((req as { transactionID?: unknown }).transactionID).toBeUndefined();
    });

    it('rolls back the transaction, releases the turn, and rethrows when the user-message write fails', async () => {
      const db = {
        beginTransaction: vi.fn(() => Promise.resolve('tx-1')),
        commitTransaction: vi.fn(() => Promise.resolve()),
        rollbackTransaction: vi.fn(() => Promise.resolve()),
      };
      const create = vi
        .fn()
        .mockResolvedValueOnce({ id: 'chat-1' })
        .mockRejectedValueOnce(new Error('write failed'));
      const { req } = makeReq({ create, db });

      await expect(
        resolveChatContext({ req, agentSlug: 'support', incoming, tools: {} }),
      ).rejects.toThrow('write failed');
      expect(db.rollbackTransaction).toHaveBeenCalledWith('tx-1');
      expect(db.commitTransaction).not.toHaveBeenCalled();
      expect(releaseTurn).toHaveBeenCalledWith({
        req,
        claim: { chatId: 'chat-1', attempt: 'attempt-1' },
        state: 'idle',
      });
    });
  });

  describe('busy chats', () => {
    beforeEach(() => {
      claimTurn.mockResolvedValue(undefined);
    });

    it.each(['queue', 'steer'] as const)(
      'persists only the last message as queued with its selection for %s delivery',
      async (delivery) => {
        const { req, create } = makeReq();

        const result = await resolveChatContext({
          req,
          agentSlug: 'support',
          chatId: 'chat-1',
          incoming,
          selection: { model: 'openai/other', reasoning: 'high' },
          tools: {},
          delivery,
        });

        expect(result).toEqual({ status: 'queued', chatId: 'chat-1', messageId: 'u2', delivery });
        expect(create).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            collection: 'messages',
            data: expect.objectContaining({
              id: 'u2',
              status: 'queued',
              delivery,
              model: 'openai/other',
              reasoning: 'high',
            }),
          }),
        );
      },
    );

    it('queues with queue delivery by default and does not load history', async () => {
      const { req, find } = makeReq();

      const result = await resolveChatContext({
        req,
        agentSlug: 'support',
        chatId: 'chat-1',
        incoming,
        tools: {},
      });

      expect(result).toMatchObject({ status: 'queued', delivery: 'queue' });
      expect(find).toHaveBeenCalledOnce();
      expect(releaseTurn).not.toHaveBeenCalled();
    });

    it('rejects editing an existing message while a turn is in progress', async () => {
      const { req, create, update } = makeReq({
        existing: [
          { id: 'u2', role: 'user', status: 'active', createdAt: '2026-08-29T00:00:00.000Z' },
        ],
      });

      await expect(
        resolveChatContext({ req, agentSlug: 'support', chatId: 'chat-1', incoming, tools: {} }),
      ).rejects.toMatchObject({ code: 'turn-in-progress', status: 409 });
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('refuses a send into a channel chat from outside its channel before writing', async () => {
      const findByID = vi.fn(() =>
        Promise.resolve({
          id: 'chat-1',
          user: 'user-1',
          channel: 'slack',
          channelKey: 'channel-key',
          channelThread: { account: 'slack-support', thread: { id: 'thread-1' } },
        }),
      );
      const { req, create } = makeReq({ findByID });

      Object.assign(req.frogbot.config, { pieces: { instances: [] } });

      await expect(
        resolveChatContext({ req, agentSlug: 'support', chatId: 'chat-1', incoming, tools: {} }),
      ).rejects.toMatchObject({ code: 'channel-chat', status: 409 });
      expect(claimTurn).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });

    it('throws turn-in-progress without writing when queueing is disabled', async () => {
      const { req, create } = makeReq();

      await expect(
        resolveChatContext({
          req,
          agentSlug: 'support',
          chatId: 'chat-1',
          incoming,
          tools: {},
          queue: false,
        }),
      ).rejects.toMatchObject({ code: 'turn-in-progress', status: 409 });
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('resuming an awaiting turn', () => {
    const pendingPart = {
      type: 'tool-question',
      toolCallId: 'call-1',
      state: 'input-available',
      input: questionPart.input,
    };
    const turnMessage = {
      id: 'a1',
      role: 'assistant',
      parts: [pendingPart],
      createdAt: '2026-08-29',
    };

    it('settles each submitted output, claims the awaiting turn, and returns server history', async () => {
      const { req, create } = makeReq({ turnMessage });

      const result = await resolveChatContext({
        req,
        agentSlug: 'support',
        chatId: 'chat-1',
        incoming: [answered],
        tools: {},
      });

      expect(settleCall).toHaveBeenCalledWith({
        req,
        agentSlug: 'support',
        chat: { id: 'chat-1', user: 'user-1' },
        toolCallId: 'call-1',
        outcome: { output: questionPart.output },
        actor: { user: { collection: 'users', id: 'user-1' } },
      });
      expect(claimTurn).toHaveBeenCalledWith({ req, chatId: 'chat-1', from: 'awaiting' });
      expect(create).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: 'ready',
        chatId: 'chat-1',
        uiMessages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'One' }] }],
        claim: { chatId: 'chat-1', attempt: 'attempt-1' },
        selection: {},
      });
    });

    it('resumes with the latest user message selection instead of the request selection', async () => {
      const find = vi.fn((args: FindArgs & { where?: { and?: object[] } }) => {
        if (args.limit !== 1) return Promise.resolve({ docs: [historyDoc] });

        const governing = args.where?.and?.some(
          (condition) => 'role' in condition && condition.role !== undefined,
        );

        return Promise.resolve({
          docs: [
            governing ? { ...historyDoc, model: 'openai/other', reasoning: 'high' } : turnMessage,
          ],
        });
      });

      const { req } = makeReq({ find });

      const result = await resolveChatContext({
        req,
        agentSlug: 'support',
        chatId: 'chat-1',
        incoming: [answered],
        selection: { model: 'openai/test' },
        tools: {},
      });

      expect(result).toMatchObject({
        status: 'ready',
        selection: { model: 'openai/other', reasoning: 'high' },
      });
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            and: [
              { chat: { equals: 'chat-1' } },
              { role: { equals: 'user' } },
              { status: { not_equals: 'queued' } },
            ],
          },
          sort: ['-createdAt', '-id'],
          limit: 1,
        }),
      );
    });

    it('rejects an assistant message that is not the latest turn message', async () => {
      const { req } = makeReq({ turnMessage: { ...turnMessage, id: 'a0' } });

      await expect(
        resolveChatContext({
          req,
          agentSlug: 'support',
          chatId: 'chat-1',
          incoming: [answered],
          tools: {},
        }),
      ).rejects.toMatchObject({ code: 'not-awaiting', status: 409 });
      expect(settleCall).not.toHaveBeenCalled();
    });

    it('rejects an assistant message without a tool output', async () => {
      const { req } = makeReq({ turnMessage });

      await expect(
        resolveChatContext({
          req,
          agentSlug: 'support',
          chatId: 'chat-1',
          incoming: [{ id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] }],
          tools: {},
        }),
      ).rejects.toMatchObject({ message: 'Submit a tool output for a pending call.', status: 400 });
      expect(settleCall).not.toHaveBeenCalled();
    });

    it('rejects an output for a call that was already settled', async () => {
      settleCall.mockResolvedValue({ status: 'already-settled', allSettled: true });

      const { req } = makeReq({ turnMessage });

      await expect(
        resolveChatContext({
          req,
          agentSlug: 'support',
          chatId: 'chat-1',
          incoming: [answered],
          tools: {},
        }),
      ).rejects.toMatchObject({ code: 'already-settled', status: 409 });
      expect(claimTurn).not.toHaveBeenCalled();
    });

    it('rejects a resubmission whose outputs were all settled already, without settling again', async () => {
      const { req } = makeReq({
        turnMessage: { ...turnMessage, settlements: { 'call-1': { outcome: 'answered' } } },
      });

      await expect(
        resolveChatContext({
          req,
          agentSlug: 'support',
          chatId: 'chat-1',
          incoming: [answered],
          tools: {},
        }),
      ).rejects.toMatchObject({ code: 'already-settled', status: 409 });
      expect(settleCall).not.toHaveBeenCalled();
      expect(claimTurn).not.toHaveBeenCalled();
    });

    it('does not continue while other calls in the step are still pending', async () => {
      settleCall.mockResolvedValue({ status: 'settled', allSettled: false });

      const { req } = makeReq({ turnMessage });

      await expect(
        resolveChatContext({
          req,
          agentSlug: 'support',
          chatId: 'chat-1',
          incoming: [answered],
          tools: {},
        }),
      ).rejects.toMatchObject({ code: 'pending-calls', status: 409 });
      expect(claimTurn).not.toHaveBeenCalled();
    });

    it('rejects a resume when another request already continued the turn', async () => {
      claimTurn.mockResolvedValue(undefined);

      const { req } = makeReq({ turnMessage });

      await expect(
        resolveChatContext({
          req,
          agentSlug: 'support',
          chatId: 'chat-1',
          incoming: [answered],
          tools: {},
        }),
      ).rejects.toMatchObject({ code: 'turn-in-progress', status: 409 });
    });

    it('returns the turn to awaiting when history cannot be loaded', async () => {
      const find = vi.fn((args: FindArgs) =>
        args.limit === 1
          ? Promise.resolve({ docs: [turnMessage] })
          : Promise.reject(new Error('history failed')),
      );
      const { req } = makeReq({ find });

      await expect(
        resolveChatContext({
          req,
          agentSlug: 'support',
          chatId: 'chat-1',
          incoming: [answered],
          tools: {},
        }),
      ).rejects.toThrow('history failed');
      expect(releaseTurn).toHaveBeenCalledWith({
        req,
        claim: { chatId: 'chat-1', attempt: 'attempt-1' },
        state: 'awaiting',
      });
    });
  });
});

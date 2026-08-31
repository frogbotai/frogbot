import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import { resolveChatContext } from '../../../../packages/frogbot/src/chat/chatContext.js';
import type { SanitizedChatConfig } from '../../../../packages/frogbot/src/chat/types.js';
import type { FrogbotRequest } from '../../../../packages/frogbot/src/types/request.js';

const incoming: UIMessage[] = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'One' }] },
  { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Two' }] },
];

const historyDoc = { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'One' }] };

function makeReq({
  chat = { enabled: true, chatsSlug: 'chats', messagesSlug: 'messages' },
  create = vi.fn(() => Promise.resolve({ id: 'chat-1' })),
  db = {},
  deleteFn = vi.fn(() => Promise.resolve({})),
  find = vi.fn((args: { limit?: number }) =>
    Promise.resolve({ docs: args.limit === 1 ? [] : [historyDoc] }),
  ),
  findByID = vi.fn(() => Promise.resolve({ id: 'chat-1', user: 'user-1' })),
  update = vi.fn(() => Promise.resolve({})),
  user = { id: 'user-1' },
}: {
  chat?: SanitizedChatConfig;
  create?: ReturnType<typeof vi.fn>;
  db?: Record<string, unknown>;
  deleteFn?: ReturnType<typeof vi.fn>;
  find?: ReturnType<typeof vi.fn>;
  findByID?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
  user?: { id: string } | null;
} = {}) {
  const req = {
    user,
    payload: { db },
    frogbot: { config: { chat }, create, delete: deleteFn, find, findByID, update },
  } as unknown as FrogbotRequest;
  return { req, create, deleteFn, find, findByID, update };
}

describe('resolveChatContext', () => {
  it('persists incoming messages for callers without a user', async () => {
    const { req, create } = makeReq({ user: null });
    const result = await resolveChatContext({ req, agentSlug: 'support', incoming, tools: {} });

    expect(result.chatId).toBe('chat-1');
    expect(create).toHaveBeenNthCalledWith(1, {
      collection: 'chats',
      data: { user: null, agent: 'support' },
      req,
      overrideAccess: true,
    });
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('returns incoming messages untouched when chat is disabled', async () => {
    const { req, create } = makeReq({ chat: { enabled: false } });
    const result = await resolveChatContext({ req, agentSlug: 'support', incoming, tools: {} });

    expect(result).toEqual({ uiMessages: incoming });
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a chat and persists every incoming message when no chatId is given', async () => {
    const { req, create } = makeReq();
    const result = await resolveChatContext({ req, agentSlug: 'support', incoming, tools: {} });

    expect(create).toHaveBeenCalledTimes(3);
    expect(create).toHaveBeenNthCalledWith(1, {
      collection: 'chats',
      data: { user: 'user-1', agent: 'support' },
      req,
      overrideAccess: true,
    });
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        collection: 'messages',
        data: expect.objectContaining({
          chat: 'chat-1',
          role: 'user',
          parts: incoming[0].parts,
        }),
        overrideAccess: true,
      }),
    );
    expect(result.chatId).toBe('chat-1');
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
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'messages',
        data: expect.objectContaining({ chat: 7 }),
      }),
    );
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { chat: { equals: 7 } } }));
  });

  it('replaces an edited message and deletes later messages when its id already exists', async () => {
    const find = vi.fn((args: { limit?: number }) =>
      Promise.resolve({
        docs:
          args.limit === 1 ? [{ id: 'u2', createdAt: '2026-08-29T00:00:00.000Z' }] : [historyDoc],
      }),
    );
    const { req, create, deleteFn, update } = makeReq({ find });
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
        data: { parts: incoming[1].parts, metadata: undefined },
      }),
    );
    expect(deleteFn).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'messages',
        where: {
          and: [
            { chat: { equals: 'chat-1' } },
            { createdAt: { greater_than: '2026-08-29T00:00:00.000Z' } },
          ],
        },
      }),
    );
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
    expect(create).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
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

  it('loads history sorted by createdAt,id and returns validated UIMessages', async () => {
    const find = vi.fn(() =>
      Promise.resolve({
        docs: [
          {
            id: 42,
            role: 'user',
            parts: [{ type: 'text', text: 'Hi' }],
            metadata: { source: 'web' },
          },
          { id: 43, role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] },
        ],
      }),
    );
    const { req } = makeReq({ find });
    const result = await resolveChatContext({ req, agentSlug: 'support', incoming, tools: {} });

    expect(find).toHaveBeenCalledWith({
      collection: 'messages',
      where: { chat: { equals: 'chat-1' } },
      sort: ['createdAt', 'id'],
      pagination: false,
      depth: 0,
      req,
      overrideAccess: true,
    });
    expect(result.uiMessages).toEqual([
      {
        id: '42',
        role: 'user',
        parts: [{ type: 'text', text: 'Hi' }],
        metadata: { source: 'web' },
      },
      { id: '43', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] },
    ]);
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

  it('rolls back the transaction and rethrows when the user-message write fails', async () => {
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
  });
});

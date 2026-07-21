import { describe, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';

import type { SanitizedChatConfig } from '../types/chat.js';
import type { FrogbotRequest } from '../types/request.js';
import { resolveThreadContext } from './threadContext.js';

const incoming: UIMessage[] = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'One' }] },
  { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Two' }] },
];

const historyDoc = { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'One' }] };

function makeReq({
  chat = { enabled: true, threadsSlug: 'threads', messagesSlug: 'messages' },
  create = vi.fn(() => Promise.resolve({ id: 'thread-1' })),
  db = {},
  find = vi.fn(() => Promise.resolve({ docs: [historyDoc] })),
  findByID = vi.fn(() => Promise.resolve({ id: 'thread-1' })),
  user = { id: 'user-1' },
}: {
  chat?: SanitizedChatConfig;
  create?: ReturnType<typeof vi.fn>;
  db?: Record<string, unknown>;
  find?: ReturnType<typeof vi.fn>;
  findByID?: ReturnType<typeof vi.fn>;
  user?: { id: string } | null;
} = {}) {
  const req = {
    user,
    payload: { db },
    frogbot: { config: { chat }, create, find, findByID },
  } as unknown as FrogbotRequest;
  return { req, create, find, findByID };
}

describe('resolveThreadContext', () => {
  it('returns incoming messages untouched for anonymous callers', async () => {
    const { req, create, find, findByID } = makeReq({ user: null });
    const result = await resolveThreadContext({ req, agentSlug: 'support', incoming, tools: {} });

    expect(result).toEqual({ uiMessages: incoming });
    expect(create).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
    expect(findByID).not.toHaveBeenCalled();
  });

  it('returns incoming messages untouched when chat is disabled', async () => {
    const { req, create } = makeReq({ chat: { enabled: false } });
    const result = await resolveThreadContext({ req, agentSlug: 'support', incoming, tools: {} });

    expect(result).toEqual({ uiMessages: incoming });
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a thread and persists every incoming message when no threadId is given', async () => {
    const { req, create } = makeReq();
    const result = await resolveThreadContext({ req, agentSlug: 'support', incoming, tools: {} });

    expect(create).toHaveBeenCalledTimes(3);
    expect(create).toHaveBeenNthCalledWith(1, {
      collection: 'threads',
      data: { user: 'user-1', agent: 'support' },
      req,
      overrideAccess: false,
    });
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        collection: 'messages',
        data: expect.objectContaining({ thread: 'thread-1', role: 'user', parts: incoming[0].parts }),
        overrideAccess: false,
      }),
    );
    expect(result.threadId).toBe('thread-1');
  });

  it('verifies ownership and persists only the last incoming message when threadId is given', async () => {
    const { req, create, findByID } = makeReq();
    await resolveThreadContext({ req, agentSlug: 'support', threadId: 'thread-7', incoming, tools: {} });

    expect(findByID).toHaveBeenCalledWith({
      collection: 'threads',
      id: 'thread-7',
      req,
      overrideAccess: false,
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'messages',
        data: expect.objectContaining({ thread: 'thread-7', parts: incoming[1].parts }),
      }),
    );
  });

  it('loads history sorted by createdAt,id and returns validated UIMessages', async () => {
    const find = vi.fn(() =>
      Promise.resolve({
        docs: [
          { id: 42, role: 'user', parts: [{ type: 'text', text: 'Hi' }], metadata: { source: 'web' } },
          { id: 43, role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] },
        ],
      }),
    );
    const { req } = makeReq({ find });
    const result = await resolveThreadContext({ req, agentSlug: 'support', incoming, tools: {} });

    expect(find).toHaveBeenCalledWith({
      collection: 'messages',
      where: { thread: { equals: 'thread-1' } },
      sort: ['createdAt', 'id'],
      pagination: false,
      depth: 0,
      req,
      overrideAccess: false,
    });
    expect(result.uiMessages).toEqual([
      { id: '42', role: 'user', parts: [{ type: 'text', text: 'Hi' }], metadata: { source: 'web' } },
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
    await resolveThreadContext({ req, agentSlug: 'support', incoming, tools: {} });

    expect(db.beginTransaction).toHaveBeenCalledOnce();
    expect(db.commitTransaction).toHaveBeenCalledWith('tx-1');
    expect(db.rollbackTransaction).not.toHaveBeenCalled();
    expect(Math.max(...create.mock.invocationCallOrder)).toBeLessThan(db.commitTransaction.mock.invocationCallOrder[0]);
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
      .mockResolvedValueOnce({ id: 'thread-1' })
      .mockRejectedValueOnce(new Error('write failed'));
    const { req } = makeReq({ create, db });

    await expect(resolveThreadContext({ req, agentSlug: 'support', incoming, tools: {} })).rejects.toThrow(
      'write failed',
    );
    expect(db.rollbackTransaction).toHaveBeenCalledWith('tx-1');
    expect(db.commitTransaction).not.toHaveBeenCalled();
  });
});

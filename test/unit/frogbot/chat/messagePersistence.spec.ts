import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MESSAGE_USAGE_CONTEXT_KEY } from '../../../../packages/frogbot/src/chat/collections/messages.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

const { updateIfVersion } = vi.hoisted(() => ({ updateIfVersion: vi.fn() }));

vi.mock('../../../../packages/frogbot/src/database/compareAndSet.js', () => ({ updateIfVersion }));

const { createMessageUsage, persistAssistantMessage } =
  await import('../../../../packages/frogbot/src/chat/messagePersistence.js');

const chat = { enabled: true, chatsSlug: 'chats', messagesSlug: 'messages' };

const message: UIMessage = {
  id: 'assistant-1',
  role: 'assistant',
  parts: [{ type: 'text', text: 'Hello' }],
  metadata: {
    source: 'agent',
    usage: {
      inputTokens: 2,
      outputTokens: 3,
      totalTokens: 5,
      model: 'openai/test',
      provider: 'openai',
    },
  },
};

function makeReq({ stored = null }: { stored?: Record<string, unknown> | null } = {}) {
  const create = vi.fn(() => Promise.resolve({ id: message.id }));
  const update = vi.fn(() => Promise.resolve({ id: message.id }));
  const findByID = vi.fn(() => Promise.resolve(stored));
  const titleFindByID = vi.fn(() => Promise.resolve({ id: 'chat-1', title: 'Existing' }));
  const titleReq = { frogbot: { config: { chat }, findByID: titleFindByID } };
  const createRequest = vi.fn(() => Promise.resolve(titleReq));

  const req = {
    user: { id: 'user-1' },
    context: { source: 'test' },
    frogbot: { config: { chat }, create, createRequest, findByID, update },
  } as unknown as FrogBotRequest;

  return { req, create, createRequest, findByID, titleFindByID, titleReq, update };
}

describe('assistant message persistence', () => {
  beforeEach(() => {
    updateIfVersion.mockReset().mockResolvedValue(true);
  });

  it('creates an assistant message with usage in hook context and bumps the chat', async () => {
    const { req, create, update } = makeReq();

    await persistAssistantMessage({ req, chatId: 'chat-1', message });

    expect(create).toHaveBeenCalledWith({
      collection: 'messages',
      data: {
        id: 'assistant-1',
        chat: 'chat-1',
        role: 'assistant',
        parts: message.parts,
        version: 0,
        metadata: { source: 'agent' },
      },
      context: {
        [MESSAGE_USAGE_CONTEXT_KEY]: expect.objectContaining({
          totalTokens: 5,
          model: 'openai/test',
        }),
      },
      req,
      overrideAccess: true,
    });
    expect(updateIfVersion).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'chats',
        id: 'chat-1',
        data: { lastMessageAt: expect.any(String) },
      }),
    );
  });

  it('updates a stored message at its version and adds the new usage to the stored usage', async () => {
    const { req, create } = makeReq({
      stored: {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hel' }],
        version: 2,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      },
    });

    await persistAssistantMessage({ req, chatId: 'chat-1', message });

    expect(create).not.toHaveBeenCalled();
    expect(updateIfVersion).toHaveBeenCalledWith({
      req,
      collection: 'messages',
      id: 'assistant-1',
      version: 2,
      data: {
        parts: message.parts,
        metadata: { source: 'agent' },
        usage: expect.objectContaining({ inputTokens: 3, outputTokens: 4, totalTokens: 7 }),
      },
    });
  });

  it('does not bump the chat when the message write keeps conflicting', async () => {
    updateIfVersion.mockResolvedValue(false);

    const { req, update } = makeReq({
      stored: { id: 'assistant-1', role: 'assistant', parts: [], version: 0 },
    });

    await expect(persistAssistantMessage({ req, chatId: 'chat-1', message })).rejects.toMatchObject(
      { code: 'write-conflict', status: 409 },
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('starts title generation on a detached request after the durable writes', async () => {
    const { req, createRequest, titleFindByID, titleReq, update } = makeReq();

    await persistAssistantMessage({
      req,
      chatId: 'chat-1',
      message,
      history: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
      mainModel: 'openai/test',
    });

    expect(createRequest).toHaveBeenCalledWith({ user: req.user, context: req.context });
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(
      createRequest.mock.invocationCallOrder[0],
    );
    expect(titleFindByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'chats', id: 'chat-1', req: titleReq }),
    );
  });

  it('skips title generation without history and a main model', async () => {
    const { req, createRequest } = makeReq();

    await persistAssistantMessage({ req, chatId: 'chat-1', message });

    expect(createRequest).not.toHaveBeenCalled();
  });

  it('maps model usage into the stored usage shape', () => {
    expect(
      createMessageUsage(
        {
          inputTokens: 4,
          outputTokens: 3,
          totalTokens: 7,
          inputTokenDetails: { cacheReadTokens: 2, noCacheTokens: 2, cacheWriteTokens: 0 },
          outputTokenDetails: { reasoningTokens: 1, textTokens: 2 },
          raw: undefined,
        },
        'anthropic/claude-test',
      ),
    ).toEqual({
      inputTokens: 4,
      outputTokens: 3,
      totalTokens: 7,
      reasoningTokens: 1,
      cachedInputTokens: 2,
      model: 'anthropic/claude-test',
      provider: 'anthropic',
    });
  });
});

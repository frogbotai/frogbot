import { describe, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';

import type { FrogbotRequest } from '../types/request.js';
import { MESSAGE_USAGE_CONTEXT_KEY } from './collections/messages.js';
import { createMessageUsage, persistAssistantMessage } from './messagePersistence.js';

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

function makeReq() {
  const create = vi.fn(() => Promise.resolve({ id: message.id }));
  const update = vi.fn(() => Promise.resolve({ id: message.id }));
  const req = {
    user: { id: 'user-1' },
    frogbot: {
      config: { chat: { enabled: true, threadsSlug: 'threads', messagesSlug: 'messages' } },
      create,
      update,
    },
  } as unknown as FrogbotRequest;
  return { req, create, update };
}

describe('assistant message persistence', () => {
  it('creates an assistant message with usage in hook context and bumps the thread', async () => {
    const { req, create, update } = makeReq();

    await persistAssistantMessage({ req, threadId: 'thread-1', message, isContinuation: false });

    expect(create).toHaveBeenCalledWith({
      collection: 'messages',
      data: {
        id: 'assistant-1',
        thread: 'thread-1',
        role: 'assistant',
        parts: message.parts,
        metadata: { source: 'agent' },
      },
      context: {
        [MESSAGE_USAGE_CONTEXT_KEY]: expect.objectContaining({ totalTokens: 5, model: 'openai/test' }),
      },
      req,
      overrideAccess: false,
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'threads',
        id: 'thread-1',
        data: { lastMessageAt: expect.any(String) },
      }),
    );
  });

  it('updates the existing message for continuations', async () => {
    const { req, create, update } = makeReq();

    await persistAssistantMessage({ req, threadId: 'thread-1', message, isContinuation: true });

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ collection: 'messages', id: 'assistant-1', data: expect.objectContaining({ parts: message.parts }) }),
    );
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

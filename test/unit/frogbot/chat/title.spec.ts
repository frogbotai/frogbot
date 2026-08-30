import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import {
  generateChatTitle,
  suggestChatTitle,
} from '../../../../packages/frogbot/src/chat/title.js';
import type { FrogbotRequest } from '../../../../packages/frogbot/src/types/request.js';

const userMessage: UIMessage = {
  id: 'user-1',
  role: 'user',
  parts: [{ type: 'text', text: 'Explain why frogs sing at night' }],
};
const assistantMessage: UIMessage = {
  id: 'assistant-1',
  role: 'assistant',
  parts: [{ type: 'text', text: 'Frogs call to attract mates.' }],
};

function makeReq({ title = null, text = 'Why Frogs Sing at Night' } = {}) {
  const generateText = vi.fn().mockResolvedValue({ text });
  const findByID = vi.fn().mockResolvedValue({ id: 'chat-1', title });
  const update = vi.fn().mockResolvedValue({ id: 'chat-1' });
  const error = vi.fn();
  const req = {
    frogbot: {
      config: {
        ai: {
          providers: {
            internal: {
              type: 'openai-compatible',
              baseUrl: 'https://models.test',
              models: [{ id: 'chat', mode: 'chat' }],
            },
          },
          routers: {},
        },
        chat: { enabled: true, chatsSlug: 'chats', messagesSlug: 'messages' },
      },
      generateText,
      findByID,
      update,
      logger: { error },
    },
  } as unknown as FrogbotRequest;
  return { req, generateText, findByID, update, error };
}

describe('chat titles', () => {
  it('cleans thinking output and returns its first title line', async () => {
    const { req } = makeReq({ text: '<think>analysis</think>\n"Nighttime Frog Songs"\nMore' });

    await expect(
      suggestChatTitle({
        req,
        history: [userMessage, assistantMessage],
        mainModel: 'internal/chat',
      }),
    ).resolves.toBe('Nighttime Frog Songs');
  });

  it('caps generated titles at 100 characters', async () => {
    const { req } = makeReq({ text: 'a'.repeat(120) });

    const title = await suggestChatTitle({
      req,
      history: [userMessage, assistantMessage],
      mainModel: 'internal/chat',
    });

    expect(title).toHaveLength(100);
    expect(title?.endsWith('…')).toBe(true);
  });

  it('skips chats whose history already has an assistant response', async () => {
    const { req, findByID } = makeReq();

    await generateChatTitle({
      req,
      chatId: 'chat-1',
      history: [userMessage, assistantMessage],
      mainModel: 'internal/chat',
      assistantMessage,
    });

    expect(findByID).not.toHaveBeenCalled();
  });

  it('never overwrites an existing title', async () => {
    const { req, generateText, update } = makeReq({ title: 'My title' });

    await generateChatTitle({
      req,
      chatId: 'chat-1',
      history: [userMessage],
      mainModel: 'internal/chat',
      assistantMessage,
    });

    expect(generateText).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('falls back to the first user text when generation fails', async () => {
    const { req, generateText, update } = makeReq();
    generateText.mockRejectedValue(new Error('upstream failed'));

    await generateChatTitle({
      req,
      chatId: 'chat-1',
      history: [userMessage],
      mainModel: 'internal/chat',
      assistantMessage,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: 'Explain why frogs sing at night' } }),
    );
  });

  it('caps fallback text without adding an ellipsis', async () => {
    const { req, generateText, update } = makeReq();
    generateText.mockRejectedValue(new Error('upstream failed'));
    const text = 'a'.repeat(120);

    await generateChatTitle({
      req,
      chatId: 'chat-1',
      history: [{ ...userMessage, parts: [{ type: 'text', text }] }],
      mainModel: 'internal/chat',
      assistantMessage,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: 'a'.repeat(100) } }),
    );
  });

  it('logs and never throws persistence failures', async () => {
    const { req, findByID, error } = makeReq();
    findByID.mockRejectedValue(new Error('database failed'));

    await expect(
      generateChatTitle({
        req,
        chatId: 'chat-1',
        history: [userMessage],
        mainModel: 'internal/chat',
        assistantMessage,
      }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});

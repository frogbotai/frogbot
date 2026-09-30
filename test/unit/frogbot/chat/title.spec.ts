import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import {
  generateChatTitle,
  placeholderChatTitle,
  suggestChatTitle,
  suggestChatTitleForChat,
} from '../../../../packages/frogbot/src/chat/title.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

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
  const findByID = vi
    .fn()
    .mockResolvedValue({ id: 'chat-1', title, user: 'user-1', agent: 'helper' });
  const find = vi.fn().mockResolvedValue({ docs: [userMessage] });
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
      find,
      update,
      logger: { error },
      agents: {
        helper: { config: { model: { default: 'internal/chat', options: ['internal/chat'] } } },
      },
    },
    user: { id: 'user-1' },
  } as unknown as FrogBotRequest;
  return { req, generateText, findByID, find, update, error };
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

  it('suggests a title from an owned chat history without queued messages', async () => {
    const { req, find, generateText } = makeReq();

    await expect(suggestChatTitleForChat({ req, chatId: 'chat-1' })).resolves.toBe(
      'Why Frogs Sing at Night',
    );
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ model: 'internal/chat' }));
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'messages',
        overrideAccess: false,
        where: { and: [{ chat: { equals: 'chat-1' } }, { status: { not_equals: 'queued' } }] },
      }),
    );
  });

  it('does not suggest a title for a chat owned by another user', async () => {
    const { req, findByID, generateText } = makeReq();
    findByID.mockResolvedValue({ id: 'chat-1', user: 'user-2', agent: 'helper' });

    await expect(suggestChatTitleForChat({ req, chatId: 'chat-1' })).resolves.toBeUndefined();
    expect(generateText).not.toHaveBeenCalled();
  });

  it('returns no suggestion when generation fails', async () => {
    const { req, generateText, error } = makeReq();
    generateText.mockRejectedValue(new Error('upstream failed'));

    await expect(suggestChatTitleForChat({ req, chatId: 'chat-1' })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
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

  it('keeps a title that differs from the placeholder', async () => {
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

  it('replaces a title equal to the placeholder', async () => {
    const { req, update } = makeReq({ title: 'Explain why frogs sing at night' });

    await generateChatTitle({
      req,
      chatId: 'chat-1',
      history: [userMessage],
      mainModel: 'internal/chat',
      assistantMessage,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: 'Why Frogs Sing at Night' } }),
    );
  });

  it('keeps a rename made while the title is being generated', async () => {
    const { req, findByID, update } = makeReq({ title: 'Explain why frogs sing at night' });

    findByID
      .mockResolvedValueOnce({ id: 'chat-1', title: 'Explain why frogs sing at night' })
      .mockResolvedValueOnce({ id: 'chat-1', title: 'Frog notes' });

    await generateChatTitle({
      req,
      chatId: 'chat-1',
      history: [userMessage],
      mainModel: 'internal/chat',
      assistantMessage,
    });

    expect(findByID).toHaveBeenCalledTimes(2);
    expect(update).not.toHaveBeenCalled();
  });

  it('replaces a user title that happens to equal the placeholder text', async () => {
    const { req, findByID, update } = makeReq();

    findByID
      .mockResolvedValueOnce({ id: 'chat-1', title: null })
      .mockResolvedValueOnce({ id: 'chat-1', title: 'Explain why frogs sing at night' });

    await generateChatTitle({
      req,
      chatId: 'chat-1',
      history: [userMessage],
      mainModel: 'internal/chat',
      assistantMessage,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: 'Why Frogs Sing at Night' } }),
    );
  });

  it('keeps an earlier placeholder after the first message is edited', async () => {
    const { req, generateText, update } = makeReq({ title: 'Why do toads croak?' });

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

  it('keeps the placeholder when generation fails', async () => {
    const { req, generateText, update, error } = makeReq({
      title: 'Explain why frogs sing at night',
    });

    generateText.mockRejectedValue(new Error('upstream failed'));

    await generateChatTitle({
      req,
      chatId: 'chat-1',
      history: [userMessage],
      mainModel: 'internal/chat',
      assistantMessage,
    });

    expect(error).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('writes no fallback title for an untitled chat when generation fails', async () => {
    const { req, generateText, update } = makeReq();

    generateText.mockRejectedValue(new Error('upstream failed'));

    await generateChatTitle({
      req,
      chatId: 'chat-1',
      history: [{ ...userMessage, parts: [{ type: 'text', text: 'a'.repeat(120) }] }],
      mainModel: 'internal/chat',
      assistantMessage,
    });

    expect(update).not.toHaveBeenCalled();
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

  it('uses a short first message as the placeholder', () => {
    expect(placeholderChatTitle([userMessage])).toBe('Explain why frogs sing at night');
  });

  it('cuts a long first message to 48 characters ending in an ellipsis', () => {
    const text = 'How do frogs survive winter under the ice of frozen ponds?';

    const placeholder = placeholderChatTitle([{ role: 'user', parts: [{ type: 'text', text }] }]);

    expect(placeholder).toBe('How do frogs survive winter under the ice of fr…');
    expect(placeholder).toHaveLength(48);
  });

  it('never splits an emoji at the placeholder cut point', () => {
    const text = `${'a'.repeat(46)}🐸 sings`;

    const placeholder = placeholderChatTitle([{ role: 'user', parts: [{ type: 'text', text }] }]);

    expect(placeholder).toBe(`${'a'.repeat(46)}…`);
  });

  it('keeps an emoji that fits before the placeholder cut point', () => {
    const text = `${'a'.repeat(45)}🐸 sings`;

    const placeholder = placeholderChatTitle([{ role: 'user', parts: [{ type: 'text', text }] }]);

    expect(placeholder).toBe(`${'a'.repeat(45)}🐸…`);
    expect(placeholder).toHaveLength(48);
  });

  it('has no placeholder for an image-only first message', () => {
    const image = { type: 'file', mediaType: 'image/png', url: 'https://files.test/frog.png' };

    expect(placeholderChatTitle([{ role: 'user', parts: [image] }])).toBeUndefined();
  });
});

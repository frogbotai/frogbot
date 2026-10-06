import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTelegramAdapter } from '../../../packages/pieces/piece-telegram-bot/node_modules/@chat-adapter/telegram/dist/index.js';
import {
  createFrogBotTelegramAdapter,
  routableMessage,
} from '../../../packages/pieces/piece-telegram-bot/src/adapter.js';

const from = { id: 42, is_bot: false, first_name: 'Frog' };
const bot = { id: 999, is_bot: true, first_name: 'FrogBot' };
const supergroup = { id: -100123, type: 'supergroup', title: 'Pond' };
const forum = { ...supergroup, is_forum: true };

const recorded = {
  anchoredReply: {
    message_id: 51,
    date: 1_789_000_000,
    text: 'Teal',
    from,
    chat: supergroup,
    message_thread_id: 50,
    reply_to_message: {
      message_id: 50,
      date: 1_789_000_000,
      text: 'Question',
      from: bot,
      chat: supergroup,
    },
  },
  topicMessage: {
    message_id: 61,
    date: 1_789_000_000,
    text: 'Hello',
    from,
    chat: forum,
    message_thread_id: 7,
    is_topic_message: true,
  },
  forumGeneralReply: {
    message_id: 71,
    date: 1_789_000_000,
    text: 'Hi',
    from,
    chat: forum,
    message_thread_id: 70,
  },
  direct: {
    message_id: 81,
    date: 1_789_000_000,
    text: 'Hi',
    from,
    chat: { id: 42, type: 'private', first_name: 'Frog' },
  },
};

function adapterWith(create: typeof createTelegramAdapter) {
  const adapter = create({
    botToken: '999:token',
    secretToken: 'secret',
    userName: 'frogbot',
    mode: 'webhook',
    logger: { debug() {}, info() {}, warn() {}, error() {}, child: () => undefined } as never,
  });

  const chat = { processMessage: vi.fn(), processAction: vi.fn() };

  Object.assign(adapter, { chat });

  const process = (update: object) =>
    (adapter as unknown as { processUpdate(update: object): void }).processUpdate({
      update_id: 1,
      ...update,
    });

  return { adapter, chat, process };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ ok: true, result: true })),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('Telegram adapter thread routing', () => {
  it('keeps a reply in a group without topics in the group conversation', () => {
    const plain = adapterWith(createTelegramAdapter);
    const routed = adapterWith(createFrogBotTelegramAdapter as typeof createTelegramAdapter);

    plain.process({ message: recorded.anchoredReply });
    routed.process({ message: recorded.anchoredReply });

    expect(plain.chat.processMessage.mock.calls[0][1]).toBe('telegram:-100123:50');
    expect(routed.chat.processMessage.mock.calls[0][1]).toBe('telegram:-100123');
    expect(routed.chat.processMessage.mock.calls[0][2].replyTo.id).toBe('-100123:50');
  });

  it('keeps forum topics and private chats, and puts General-topic replies in the group', () => {
    const { chat, process } = adapterWith(
      createFrogBotTelegramAdapter as typeof createTelegramAdapter,
    );

    process({ message: recorded.topicMessage });
    process({ edited_message: recorded.forumGeneralReply });
    process({ message: recorded.direct });

    expect(chat.processMessage.mock.calls.map((call) => call[1])).toEqual([
      'telegram:-100123:7',
      'telegram:-100123',
      'telegram:42',
    ]);
  });

  it('routes a tap on an anchored bot message to the group', () => {
    const { chat, process } = adapterWith(
      createFrogBotTelegramAdapter as typeof createTelegramAdapter,
    );

    process({
      callback_query: {
        id: 'callback-1',
        chat_instance: 'pond',
        data: 'q:x',
        from,
        message: { ...recorded.anchoredReply, from: bot },
      },
    });

    expect(chat.processAction.mock.calls[0][0]).toMatchObject({
      threadId: 'telegram:-100123',
      messageId: '-100123:51',
      actionId: 'q:x',
    });
  });

  it('normalizes messages parsed outside a webhook update', () => {
    const { adapter } = adapterWith(createFrogBotTelegramAdapter as typeof createTelegramAdapter);

    expect(adapter.parseMessage(recorded.anchoredReply as never).threadId).toBe('telegram:-100123');
  });

  it('returns messages that need no change untouched', () => {
    expect(routableMessage(recorded.topicMessage as never)).toBe(recorded.topicMessage);
    expect(routableMessage(recorded.direct as never)).toBe(recorded.direct);
    expect(routableMessage(recorded.anchoredReply as never)).not.toHaveProperty(
      'message_thread_id',
    );
  });
});

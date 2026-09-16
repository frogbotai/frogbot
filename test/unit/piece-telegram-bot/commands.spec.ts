import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { createTelegramBot } from '../../../packages/pieces/piece-telegram-bot/src/index.js';
import { channelFixture, deferred } from '../frogbot/channels/helpers.js';

const auth = { botToken: '123:telegram-test-token' };
const webhookSecret = 'telegram-command-secret';

function telegramFixture() {
  const requests: Array<{ method: string; body: Record<string, unknown> }> = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = url.split('/').at(-1)!;
      const body = JSON.parse(String(init?.body ?? '{}'));

      requests.push({ method, body });

      let result: unknown;

      switch (method) {
        case 'getMe':
          result = { id: 123, is_bot: true, first_name: 'FrogBot', username: 'frogbot' };
          break;
        case 'getChat':
          result = {
            id: Number(body.chat_id),
            type: Number(body.chat_id) > 0 ? 'private' : 'supergroup',
          };
          break;
        case 'sendChatAction':
          result = true;
          break;
        case 'sendMessage':
        case 'editMessageText':
          result = {
            message_id: 900,
            date: 1_789_000_000,
            chat: { id: Number(body.chat_id), type: 'private' },
            from: { id: 123, is_bot: true, first_name: 'FrogBot', username: 'frogbot' },
            text: body.text,
          };
          break;
        default:
          throw new Error(`Unexpected Telegram API request: ${method}`);
      }

      return Response.json({ ok: true, result });
    }),
  );

  const fixture = channelFixture({ slug: 'telegramBot' });
  const piece = createTelegramBot({
    auth,
    webhookSecret,
    botUsername: 'frogbot',
    allowedUserIds: ['42'],
  });

  fixture.frogbot.agents.support.config.channels.splice(0, 1, piece as never);
  fixture.frogbot.connections.resolvePieceCredential.mockResolvedValue({ auth, key: auth });

  const deliver = ({
    id = 1,
    updateId = id,
    text = '/start',
    userId = 42,
    chatId = 42,
    topic,
    secret = webhookSecret,
  }: {
    id?: number;
    updateId?: number;
    text?: string;
    userId?: number;
    chatId?: number;
    topic?: number;
    secret?: string;
  } = {}) =>
    fixture.host.webhook(
      piece.slug,
      new Request('https://frogbot.example/api/webhooks/telegramBot', {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': secret },
        body: JSON.stringify({
          update_id: updateId,
          message: {
            message_id: id,
            date: 1_789_000_000,
            text,
            entities: text.startsWith('/')
              ? [{ type: 'bot_command', offset: 0, length: text.split(' ')[0]!.length }]
              : [],
            from: { id: userId, is_bot: false, first_name: 'Frog', username: 'frog' },
            chat: { id: chatId, type: chatId > 0 ? 'private' : 'supergroup' },
            ...(topic ? { message_thread_id: topic, is_topic_message: true } : {}),
          },
        }),
      }),
    );

  const run = async (index: number) => {
    const task = fixture.host.run(fixture.inputs[index]!);

    await vi.runAllTimersAsync();
    await task;
  };

  return { ...fixture, deliver, requests, run };
}

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Telegram commands through the installed adapter and channel host', () => {
  it('routes Start and command arguments through the same conversation as ordinary DMs', async () => {
    const fixture = telegramFixture();

    await fixture.host.initialize(false);

    try {
      expect((await fixture.deliver())?.status).toBe(200);
      expect(fixture.inputs).toHaveLength(1);

      await fixture.run(0);
      await fixture.deliver({ id: 2, text: '/help setup' });
      await fixture.run(1);
      await fixture.deliver({ id: 3, text: 'Hello' });
      await fixture.run(2);

      expect(fixture.inputs.map(({ message }) => message.text)).toEqual([
        '/start',
        '/help setup',
        'Hello',
      ]);
      expect(fixture.streamMessage.mock.calls.map(([call]) => call.chatId)).toEqual([
        'chat-1',
        'chat-1',
        'chat-1',
      ]);
      expect(fixture.streamMessage.mock.calls[0]![0].req).toMatchObject({
        user: null,
        context: { channel: { piece: 'telegramBot', author: { id: '42' } } },
      });
      expect(fixture.requests.filter(({ method }) => method === 'sendMessage')).toHaveLength(3);
    } finally {
      await fixture.host.shutdown();
    }
  });

  it('waits for command enqueue and deduplicates update retries and repeated message IDs', async () => {
    const fixture = telegramFixture();
    const held = deferred();

    fixture.queue.mockImplementation(async ({ input }) => {
      await held.promise;

      fixture.inputs.push(input);
    });

    await fixture.host.initialize(false);

    let acknowledged = false;
    const delivery = fixture.deliver({ text: '/start referral' }).then(() => {
      acknowledged = true;
    });

    try {
      await vi.waitFor(() => expect(fixture.queue).toHaveBeenCalledOnce());

      expect(acknowledged).toBe(false);

      held.resolve();
      await delivery;
      await fixture.deliver({ text: '/start referral' });
      await fixture.deliver({ updateId: 2, text: '/start referral' });

      expect(fixture.inputs).toHaveLength(1);
      expect(fixture.inputs[0]!.message).toMatchObject({ id: '42:1', text: '/start referral' });
    } finally {
      held.resolve();
      await delivery;
      await fixture.host.shutdown();
    }
  });

  it('preserves webhook verification, the Telegram allowlist, and default anonymous denial', async () => {
    const fixture = telegramFixture();

    Reflect.deleteProperty(fixture.frogbot.agents.support.config, 'access');

    await fixture.host.initialize(false);

    try {
      expect((await fixture.deliver({ secret: 'wrong' }))?.status).toBe(401);
      await fixture.deliver({ id: 2, userId: 99 });

      expect(fixture.inputs).toHaveLength(0);

      await fixture.deliver({ id: 3 });

      expect(fixture.inputs).toHaveLength(1);

      await fixture.run(0);

      expect(fixture.streamMessage).not.toHaveBeenCalled();
      expect(fixture.frogbot.find).not.toHaveBeenCalled();
      expect(fixture.frogbot.logger.info).toHaveBeenCalledOnce();
    } finally {
      await fixture.host.shutdown();
    }
  });

  it('keeps targeted group commands and forum topics separate without routing ordinary unmentioned groups', async () => {
    const fixture = telegramFixture();

    await fixture.host.initialize(false);

    try {
      await fixture.deliver({ text: 'Hello group', chatId: -100 });
      await fixture.deliver({ id: 2, text: '/help@otherbot', chatId: -100 });

      expect(fixture.inputs).toHaveLength(0);

      for (const topic of [7, 8]) {
        await fixture.deliver({ id: topic, text: '/help@frogbot setup', chatId: -100, topic });

        expect(fixture.inputs).toHaveLength(topic - 6);

        await fixture.run(fixture.inputs.length - 1);
      }

      expect(new Set(fixture.inputs.map(({ thread }) => thread.id)).size).toBe(2);
      expect(fixture.streamMessage.mock.calls.map(([call]) => call.chatId)).toEqual([
        'chat-1',
        'chat-2',
      ]);

      await fixture.deliver({ id: 9, text: 'Follow-up', chatId: -100, topic: 7 });
      await fixture.run(2);

      expect(fixture.streamMessage.mock.calls[2]![0].chatId).toBe('chat-1');
    } finally {
      await fixture.host.shutdown();
    }
  });
});

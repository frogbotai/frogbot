import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceConformance } from '../../../packages/frogbot/src/pieces/conformance.js';
import {
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import type { FrogBotRequest } from '../../../packages/frogbot/src/types/request.js';
import {
  createTelegramBot,
  telegramBotActions,
  telegramBotTriggers,
} from '../../../packages/pieces/piece-telegram-bot/src/index.js';
import { conformanceChannelState } from '../frogbot/pieces/channelState.js';

const auth = { botToken: 'telegram_test_key' };
const req = () =>
  ({
    frogbot: {
      connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
    },
    user: null,
  }) as never;
const response = (result: unknown = { message_id: 42 }) =>
  new Response(JSON.stringify({ ok: true, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => vi.unstubAllGlobals());

describe('telegram-bot', () => {
  it('passes channel conformance with recorded Telegram updates', async () => {
    const body = JSON.stringify({
      update_id: 123,
      message: {
        message_id: 21,
        date: 1_789_000_000,
        text: 'Hello FrogBot',
        from: { id: 42, is_bot: false, first_name: 'Frog' },
        chat: { id: -100123, type: 'supergroup', title: 'FrogBot', is_forum: true },
        message_thread_id: 7,
      },
    });
    const webhookSecret = 'telegram-webhook-secret';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (String(url).endsWith('/getMe')) {
          return response({ id: 99, is_bot: true, first_name: 'FrogBot', username: 'frogbot' });
        }

        throw new Error(`Unexpected Telegram request: ${url}`);
      }),
    );

    await expect(
      pieceConformance(createTelegramBot, {
        factoryOptions: { auth, webhookSecret, botUsername: 'frogbot', allowedUserIds: ['42'] },
        actions: telegramBotActions.map((slug) => ({ slug, input: {}, expect: { error: /./ } })),
        triggers: telegramBotTriggers.map((slug) => ({ slug, type: 'app' as const })),
        channel: {
          adapter: { name: 'telegram' },
          identity: {
            author: { userId: '42', userName: 'frog' },
            req: {} as FrogBotRequest,
            expect: null,
          },
          webhook: {
            state: conformanceChannelState(),
            requests: [
              {
                request: {
                  headers: { 'x-telegram-bot-api-secret-token': webhookSecret },
                  body,
                  data: JSON.parse(body),
                },
                verified: true,
                event: 'update',
                delivery: {
                  status: 200,
                  messages: [
                    {
                      id: '-100123:21',
                      threadId: 'telegram:-100123:7',
                      text: 'Hello FrogBot',
                      authorId: '42',
                    },
                  ],
                },
              },
              {
                request: {
                  headers: { 'x-telegram-bot-api-secret-token': 'wrong-secret' },
                  body,
                  data: JSON.parse(body),
                },
                verified: false,
                delivery: { status: 401, messages: [] },
              },
              {
                request: {
                  headers: { 'x-telegram-bot-api-secret-token': webhookSecret },
                  body: '{',
                },
                verified: true,
                delivery: { status: 400, messages: [] },
              },
            ],
          },
        },
      }),
    ).resolves.toBeUndefined();
  });

  it('exposes every semantic action and trigger', () => {
    const telegram = createTelegramBot({ auth });

    expect(pieceInstanceTools(telegram)?.map(({ slug }) => slug)).toEqual(
      telegramBotActions.map((slug) => `telegramBot_${slug}`),
    );
    expect(Object.keys(telegram.triggers)).toEqual(telegramBotTriggers);
  });

  it.each([
    [
      'sendTextMessage',
      { chatId: 10, message: 'Hello' },
      'sendMessage',
      {
        chat_id: 10,
        text: 'Hello',
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: false,
        disable_notification: false,
        protect_content: false,
      },
    ],
    [
      'deleteMessage',
      { chatId: '@channel', messageId: 12 },
      'deleteMessage',
      { chat_id: '@channel', message_id: 12 },
    ],
    ['getChatMember', { chatId: 10, userId: 20 }, 'getChatMember', { chat_id: 10, user_id: 20 }],
    [
      'sendLocation',
      { chatId: 10, latitude: 1, longitude: 2 },
      'sendLocation',
      {
        chat_id: 10,
        latitude: 1,
        longitude: 2,
        disable_notification: false,
        protect_content: false,
      },
    ],
  ] as const)('maps %s to the Telegram Bot API', async (slug, input, method, body) => {
    const fetch = vi.fn().mockResolvedValue(response());

    vi.stubGlobal('fetch', fetch);

    const telegram = createTelegramBot({ auth });
    const result = await telegram[slug]({ input, req: req() });

    expect(result).toEqual({ ok: true, result: { message_id: 42 } });
    expect(fetch).toHaveBeenCalledWith(
      `https://api.telegram.org/bottelegram_test_key/${method}`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toEqual(body);
  });

  it('selects the media endpoint and field', async () => {
    const fetch = vi.fn().mockResolvedValue(response());

    vi.stubGlobal('fetch', fetch);

    await createTelegramBot({ auth }).sendMedia({
      input: { chatId: 10, mediaType: 'video', media: 'file-id', message: 'Caption' },
      req: req(),
    });

    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://api.telegram.org/bottelegram_test_key/sendVideo',
    );
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      chat_id: 10,
      video: 'file-id',
      caption: 'Caption',
    });
  });

  it('uploads stored media with multipart form data', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('frog', { status: 200, headers: { 'Content-Type': 'image/png' } }),
      )
      .mockResolvedValueOnce(response());
    vi.stubGlobal('fetch', fetch);
    const request = {
      ...req(),
      url: 'https://frogbot.example/actions',
      headers: new Headers({ cookie: 'session=frog' }),
      frogbot: {
        connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
        config: {
          files: { slug: 'files' },
          _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://frogbot.example' }) },
        },
        findByID: vi.fn().mockResolvedValue({
          url: '/files/photo.png',
          filename: 'photo.png',
          mimeType: 'image/png',
        }),
      },
    } as never;

    await createTelegramBot({ auth }).sendMedia({
      input: { chatId: 10, mediaType: 'photo', media: { fileId: 'file' } },
      req: request,
    });

    const form = fetch.mock.calls[1]?.[1]?.body as FormData;

    expect(form).toBeInstanceOf(FormData);
    expect(form.get('chat_id')).toBe('10');
    expect((form.get('photo') as File).name).toBe('photo.png');
  });

  it('downloads Telegram files as base64 when requested', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          file_id: 'file',
          file_unique_id: 'unique',
          file_path: 'documents/file.txt',
        }),
      )
      .mockResolvedValueOnce(new Response('frog', { status: 200 }));

    vi.stubGlobal('fetch', fetch);

    const result = await createTelegramBot({ auth }).getFile({
      input: { fileId: 'file', download: true },
      req: req(),
    });

    expect(result).toEqual({
      fileInfo: { file_id: 'file', file_unique_id: 'unique', file_path: 'documents/file.txt' },
      fileUrl: 'https://api.telegram.org/file/bottelegram_test_key/documents/file.txt',
      fileContentBase64: 'ZnJvZw==',
    });
    expect(fetch.mock.calls[1]?.[0]).toBe(
      'https://api.telegram.org/file/bottelegram_test_key/documents/file.txt',
    );
  });

  it('emits and filters shared webhook updates', async () => {
    const definition = pieceFactoryDefinition(createTelegramBot).triggers?.[0];

    if (!definition || definition.type !== 'app') throw new Error('Missing Telegram app trigger.');

    const client = { call: vi.fn().mockResolvedValue({ ok: true }) };
    const input = definition.input.parse({ updateTypes: ['callback_query'] });

    const update = { update_id: 123, callback_query: { id: 'callback' } };

    const webhookReq = {
      data: update,
      headers: new Headers({ 'x-telegram-bot-api-secret-token': 'secret' }),
    };

    await expect(
      definition.run({
        client,
        input,
        options: { webhookSecret: 'secret' },
        req: webhookReq,
      } as never),
    ).resolves.toEqual([{ dedupeKey: '123', data: update }]);
    await expect(
      definition.run({
        client,
        input,
        options: { webhookSecret: 'secret' },
        req: {
          data: { update_id: 124, message: {} },
          headers: webhookReq.headers,
        },
      } as never),
    ).resolves.toEqual([]);
  });

  it('keeps direct messages, groups, and forum topics in distinct adapter threads', () => {
    const adapter = pieceFactoryDefinition(createTelegramBot).channel?.adapter({
      auth,
      options: { webhookSecret: 'secret' },
    });

    if (!adapter) throw new Error('Missing Telegram channel adapter.');

    expect(adapter.encodeThreadId({ chatId: '42' })).toBe('telegram:42');
    expect(adapter.encodeThreadId({ chatId: '-100123' })).toBe('telegram:-100123');
    expect(adapter.encodeThreadId({ chatId: '-100123', messageThreadId: 7 })).toBe(
      'telegram:-100123:7',
    );
    expect(adapter.isDM('telegram:42')).toBe(true);
    expect(adapter.isDM('telegram:-100123')).toBe(false);
  });

  it('requires explicit webhook verification for channels', () => {
    const definition = pieceFactoryDefinition(createTelegramBot);

    expect(() => definition.channel?.adapter({ auth, options: {} })).toThrow('webhookSecret');
  });

  it('keeps Telegram API failures useful', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error_code: 400,
            description: 'Bad Request: chat not found',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(
      createTelegramBot({ auth }).getChat({ input: { chatId: 10 }, req: req() }),
    ).rejects.toThrow('Telegram API getChat failed (400): Bad Request: chat not found');
  });
});

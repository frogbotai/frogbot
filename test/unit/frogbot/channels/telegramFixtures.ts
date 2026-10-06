import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { text } from 'node:stream/consumers';

export const TELEGRAM_BOT_TOKEN = '999:telegram-questions-token';
export const TELEGRAM_WEBHOOK_SECRET = 'telegram-questions-secret';
export const TELEGRAM_BOT = { id: 999, is_bot: true, first_name: 'FrogBot', username: 'frogbot' };

export type TelegramApiCall = {
  method: string;
  body: Record<string, unknown>;
  result?: { message_id?: number };
};

type TelegramFailure = { error_code: number; description: string; retry_after?: number };

type TelegramUser = { id: number; first_name: string; last_name?: string; username?: string };

export const telegramUsers = {
  frog: { id: 42, first_name: 'Frog', last_name: 'Smith', username: 'frog' },
  toad: { id: 7, first_name: 'Toad', last_name: 'Hall', username: 'toad' },
  newt: { id: 13, first_name: 'Newt' },
} satisfies Record<string, TelegramUser>;

let updateId = 0;
let incomingId = 0;

export function createTelegramApi() {
  const calls: TelegramApiCall[] = [];
  const failures = new Map<string, TelegramFailure[]>();
  let messageId = 900;

  const handle = (method: string, body: Record<string, unknown>) => {
    const call: TelegramApiCall = { method, body };

    calls.push(call);

    const failure = failures.get(method)?.shift();

    if (failure) {
      const { retry_after, ...error } = failure;

      return {
        status: failure.error_code,
        payload: { ok: false, ...error, ...(retry_after ? { parameters: { retry_after } } : {}) },
      };
    }

    const sent = (id: number) => ({
      message_id: id,
      date: 1_789_000_000,
      chat: telegramChat(Number(body.chat_id)),
      from: TELEGRAM_BOT,
      text: body.text,
      ...(typeof body.message_thread_id === 'number'
        ? { message_thread_id: body.message_thread_id, is_topic_message: true }
        : {}),
      ...(body.reply_markup ? { reply_markup: body.reply_markup } : {}),
    });

    const results: Record<string, () => unknown> = {
      getMe: () => TELEGRAM_BOT,
      sendMessage: () => sent(++messageId),
      editMessageText: () => sent(Number(body.message_id)),
    };

    const result = results[method]?.() ?? true;

    if (typeof result === 'object') call.result = result;

    return { status: 200, payload: { ok: true, result } };
  };

  const fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = url.pathname.split('/').at(-1)!;
    const { status, payload } = handle(method, JSON.parse(String(init?.body ?? '{}')));

    return Promise.resolve(Response.json(payload, { status }));
  };

  const listen = async () => {
    const server = createServer(async (req, res) => {
      const method = new URL(req.url!, 'http://localhost').pathname.split('/').at(-1)!;
      const raw = await text(req);
      const { status, payload } = handle(method, raw ? JSON.parse(raw) : {});

      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    return {
      url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
  };

  return {
    calls,
    fetch,
    listen,
    fail(method: string, ...next: TelegramFailure[]) {
      failures.set(method, [...(failures.get(method) ?? []), ...next]);
    },
    reset() {
      calls.length = 0;
      failures.clear();
    },
    of(method: string) {
      return calls.filter((call) => call.method === method).map(({ body }) => body);
    },
    cards() {
      return calls
        .filter(
          ({ method, body }) =>
            method === 'sendMessage' &&
            ((body.reply_markup as { inline_keyboard?: unknown[] } | undefined)?.inline_keyboard
              ?.length ?? 0) > 0,
        )
        .map(({ body }) => body);
    },
    lastMessageId() {
      return messageId;
    },
    message(id: number) {
      return calls.findLast(
        (call) =>
          (call.method === 'sendMessage' || call.method === 'editMessageText') &&
          call.result?.message_id === id,
      )?.body;
    },
  };
}

export type TelegramApi = ReturnType<typeof createTelegramApi>;

export function telegramChat(chatId: number, { forum = false }: { forum?: boolean } = {}) {
  return chatId > 0
    ? { id: chatId, type: 'private', first_name: 'Frog' }
    : { id: chatId, type: 'supergroup', title: 'Pond', ...(forum ? { is_forum: true } : {}) };
}

export function telegramWebhook(
  update: Record<string, unknown>,
  {
    secret = TELEGRAM_WEBHOOK_SECRET,
    updateId: id = ++updateId,
    url = 'http://localhost/api/webhooks/telegramBot',
  }: { secret?: string; updateId?: number; url?: string } = {},
) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
    body: JSON.stringify({ update_id: id, ...update }),
  });
}

export function messageUpdate({
  anchor,
  chatId = telegramUsers.frog.id,
  forum,
  from = telegramUsers.frog,
  replyTo,
  text: body = 'Hello',
  topic,
}: {
  anchor?: number;
  chatId?: number;
  forum?: boolean;
  from?: TelegramUser;
  replyTo?: number;
  text?: string;
  topic?: number;
}) {
  const inTopic = topic ? { message_thread_id: topic, is_topic_message: true } : {};

  return {
    message: {
      message_id: ++incomingId,
      date: 1_789_000_000,
      text: body,
      ...(body.startsWith('/')
        ? { entities: [{ type: 'bot_command', offset: 0, length: body.split(' ')[0].length }] }
        : {}),
      from: { ...from, is_bot: false },
      chat: telegramChat(chatId, { forum }),
      ...inTopic,
      ...(anchor ? { message_thread_id: anchor } : {}),
      ...(replyTo
        ? {
            reply_to_message: {
              message_id: replyTo,
              date: 1_789_000_000,
              chat: telegramChat(chatId, { forum }),
              from: TELEGRAM_BOT,
              text: 'Question',
              ...inTopic,
            },
          }
        : {}),
    },
  };
}

export function callbackUpdate({
  chatId = telegramUsers.frog.id,
  data,
  from = telegramUsers.frog,
  messageId,
  topic,
}: {
  chatId?: number;
  data: string;
  from?: TelegramUser;
  messageId: number;
  topic?: number;
}) {
  return {
    callback_query: {
      id: `callback-${updateId + 1}`,
      chat_instance: 'pond',
      data,
      from: { ...from, is_bot: false },
      message: {
        message_id: messageId,
        date: 1_789_000_000,
        chat: telegramChat(chatId),
        from: TELEGRAM_BOT,
        text: 'Question',
        ...(topic ? { message_thread_id: topic, is_topic_message: true } : {}),
      },
    },
  };
}

export function keyboard(body: Record<string, unknown> | undefined) {
  return (
    (
      body?.reply_markup as {
        inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
      }
    )?.inline_keyboard ?? []
  );
}

export function buttonData(body: Record<string, unknown> | undefined, label: string): string {
  const found = keyboard(body)
    .flat()
    .find(({ text: value }) => value === label || value.endsWith(` ${label}`));

  if (!found) throw new Error(`No '${label}' button on the Telegram card.`);

  return found.callback_data;
}

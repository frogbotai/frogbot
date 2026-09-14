import { vi } from 'vitest';
import { z } from 'zod';

import type {
  Adapter,
  ChatInstance,
  WebhookOptions,
} from '../../../../packages/frogbot/node_modules/chat/dist/index.js';
import { Message } from '../../../../packages/frogbot/node_modules/chat/dist/index.js';
import type { AgentStreamMessageOpts } from '../../../../packages/frogbot/src/agents/types.js';
import {
  ChannelHost,
  type ChannelTaskInput,
} from '../../../../packages/frogbot/src/channels/host.js';
import { runKVLock } from '../../../../packages/frogbot/src/kv/lock.js';
import type { KV, KVLock } from '../../../../packages/frogbot/src/kv/types.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import type { FrogbotRequest } from '../../../../packages/frogbot/src/types/request.js';

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

export function channelFixture({
  slug = 'slack',
  adapter: suppliedAdapter,
}: { slug?: string; adapter?: Adapter } = {}) {
  const values = new Map<string, unknown>();
  const locks = new Map<string, KVLock>();
  let token = 0;

  const kv = {
    acquireLock: vi.fn(async (key: string) => {
      if (locks.has(key)) return null;

      const lock = { key, token: String(++token) };

      locks.set(key, lock);

      return lock;
    }),
    extendLock: vi.fn(async (lock: KVLock) => locks.get(lock.key)?.token === lock.token),
    releaseLock: vi.fn(async (lock: KVLock) => {
      if (locks.get(lock.key)?.token !== lock.token) return false;

      return locks.delete(lock.key);
    }),
    delete: vi.fn(async (key: string) => {
      values.delete(key);
    }),
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    has: vi.fn(async (key: string) => values.has(key)),
    set: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
    setIfAbsent: vi.fn(async (key: string, value: unknown) => {
      if (values.has(key)) return false;

      values.set(key, value);

      return true;
    }),
    lock: vi.fn(
      <T>(key: string, ttl: number, fn: Parameters<KV['lock']>[2]) =>
        runKVLock({ kv: kv as unknown as KV, key, ttl, fn }) as Promise<T>,
    ),
  };

  let chat!: ChatInstance;
  const posted: Array<{ threadId: string; text: string }> = [];
  const adapter = {
    name: 'slack',
    initialize: vi.fn(async (instance: ChatInstance) => {
      chat = instance;
    }),
    handleWebhook: vi.fn(async (request: Request, options?: WebhookOptions) => {
      const data = await request.json();
      const message = new Message({
        id: data.id,
        threadId: data.threadId,
        text: data.text ?? 'Hello',
        formatted: { type: 'root', children: [] },
        raw: {},
        author: {
          userId: data.author ?? 'user-1',
          userName: 'frog',
          fullName: 'Frog',
          isBot: false,
          isMe: false,
        },
        metadata: { dateSent: new Date(), edited: false },
        attachments: [],
      });

      message.isMention = data.mention ?? true;
      chat.processMessage(adapter as unknown as Adapter, data.threadId, message, options);

      return new Response(null, { status: 202 });
    }),
    fetchThread: vi.fn(async (id: string) => ({ id, channelId: id.split(':')[0], metadata: {} })),
    channelIdFromThreadId: (id: string) => id.split(':')[0],
    isDM: (id: string) => id.startsWith('dm'),
    stream: vi.fn(async (threadId: string, stream: AsyncIterable<string>) => {
      let text = '';

      for await (const chunk of stream) text += chunk;

      posted.push({ threadId, text });

      return { id: 'reply', threadId, raw: {} };
    }),
  };

  const identity = vi.fn(async (): Promise<FrogbotRequest['user']> => null);
  const piece = definePiece({
    slug,
    label: slug,
    auth: z.object({ token: z.string() }),
    client: () => ({}),
    actions: [],
    channel: { adapter: () => suppliedAdapter ?? (adapter as unknown as Adapter), identity },
  })({ auth: { token: 'secret' } });

  const inputs: ChannelTaskInput[] = [];
  const queue = vi.fn(async ({ input }: { input: ChannelTaskInput }) => {
    inputs.push(input);
  });

  const streamMessage = vi.fn(async (_opts: AgentStreamMessageOpts) => ({
    stream: (async function* () {
      yield 'Hello back';
    })(),
    persistence: Promise.resolve(),
  }));

  const access = vi.fn(() => true);
  const chats = new Map<string, { id: string }>();
  const frogbot = {
    agents: { support: { slug: 'support', config: { channels: [piece], access }, streamMessage } },
    config: { chat: { enabled: true, chatsSlug: 'chats' } },
    connections: {
      resolvePieceCredential: vi.fn(async () => ({ auth: { token: 'secret' }, key: {} })),
    },
    createRequest: vi.fn(async (req: object) => Object.assign(req, { frogbot })),
    find: vi.fn(async ({ where }: { where: { channelKey: { equals: string } } }) => ({
      docs: chats.has(where.channelKey.equals) ? [chats.get(where.channelKey.equals)] : [],
    })),
    create: vi.fn(async ({ data }: { data: { channelKey: string } }) => {
      const row = { ...data, id: `chat-${chats.size + 1}` };

      chats.set(data.channelKey, row);

      return row;
    }),
    logger: { info: vi.fn(), error: vi.fn() },
    kv,
    queue,
  };

  const host = new ChannelHost(frogbot as never);
  const deliver = (id = 'message-1', threadId = 'channel:thread-1', extra = {}) =>
    host.webhook(
      slug,
      new Request('http://localhost/webhook', {
        method: 'POST',
        body: JSON.stringify({ id, threadId, ...extra }),
      }),
    );

  return {
    host,
    frogbot,
    kv,
    values,
    locks,
    inputs,
    queue,
    adapter,
    deliver,
    streamMessage,
    posted,
    identity,
    access,
  };
}

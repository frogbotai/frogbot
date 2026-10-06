import { vi } from 'vitest';
import { z } from 'zod';

import type {
  Adapter,
  ChatInstance,
  WebhookOptions,
} from '../../../../packages/frogbot/node_modules/chat/dist/index.js';
import { Message } from '../../../../packages/frogbot/node_modules/chat/dist/index.js';
import type { AgentStreamMessageOpts } from '../../../../packages/frogbot/src/agents/types.js';
import { ChannelHost } from '../../../../packages/frogbot/src/channels/host.js';
import type { PieceChannelQuestions } from '../../../../packages/frogbot/src/channels/questions/types.js';
import type { ChannelTaskInput } from '../../../../packages/frogbot/src/channels/types.js';
import { runKVLock } from '../../../../packages/frogbot/src/kv/lock.js';
import type { KV, KVLock } from '../../../../packages/frogbot/src/kv/types.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

export function asyncChunks<T>(...chunks: T[]): AsyncIterableIterator<T> {
  const iterator = chunks[Symbol.iterator]();

  return {
    next: () => Promise.resolve(iterator.next()),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

export function createMemoryKV() {
  const values = new Map<string, unknown>();
  const ttls = new Map<string, number | undefined>();
  const locks = new Map<string, KVLock>();
  let token = 0;

  const kv = {
    acquireLock: vi.fn((key: string): Promise<KVLock | null> => {
      if (locks.has(key)) return Promise.resolve(null);

      const lock = { key, token: String(++token) };

      locks.set(key, lock);

      return Promise.resolve(lock);
    }),
    extendLock: vi.fn((lock: KVLock) => Promise.resolve(locks.get(lock.key)?.token === lock.token)),
    releaseLock: vi.fn((lock: KVLock) => {
      if (locks.get(lock.key)?.token !== lock.token) return Promise.resolve(false);

      return Promise.resolve(locks.delete(lock.key));
    }),
    delete: vi.fn((key: string) => {
      values.delete(key);

      return Promise.resolve();
    }),
    get: vi.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
    has: vi.fn((key: string) => Promise.resolve(values.has(key))),
    set: vi.fn((key: string, value: unknown, options?: { ttl?: number }) => {
      values.set(key, value);
      ttls.set(key, options?.ttl);

      return Promise.resolve();
    }),
    setIfAbsent: vi.fn((key: string, value: unknown) => {
      if (values.has(key)) return Promise.resolve(false);

      values.set(key, value);

      return Promise.resolve(true);
    }),
    lock: vi.fn(
      <T>(key: string, ttl: number, fn: Parameters<KV['lock']>[2]) =>
        runKVLock({ kv, key, ttl, fn }) as Promise<T>,
    ),
  };

  return { kv, locks, ttls, values };
}

export function channelFixture({
  slug = 'slack',
  adapter: suppliedAdapter,
  client = {},
  questions,
}: {
  slug?: string;
  adapter?: Adapter;
  client?: object;
  questions?: PieceChannelQuestions<never>;
} = {}) {
  const { kv, locks, values } = createMemoryKV();

  let chat!: ChatInstance;
  const posted: Array<{ threadId: string; text: string }> = [];
  const adapter = {
    name: 'slack',
    initialize: vi.fn((instance: ChatInstance) => {
      chat = instance;

      return Promise.resolve();
    }),
    handleWebhook: vi.fn(async (request: Request, options?: WebhookOptions) => {
      const data = await request.json();
      const user = {
        userId: data.author ?? 'user-1',
        userName: 'frog',
        fullName: 'Frog',
        isBot: false,
        isMe: false,
      };

      if (data.type === 'action') {
        void chat.processAction(
          {
            actionId: data.actionId,
            value: data.value,
            messageId: data.messageId,
            threadId: data.threadId,
            user,
            adapter: adapter as unknown as Adapter,
            raw: data,
          },
          options,
        );

        return new Response(null, { status: 200 });
      }

      if (data.type === 'modal') {
        await chat.processModalSubmit(
          {
            callbackId: 'modal',
            viewId: 'view-1',
            values: {},
            privateMetadata: data.privateMetadata,
            user,
            adapter: adapter as unknown as Adapter,
            raw: data,
          },
          undefined,
          options,
        );

        return new Response(null, { status: 200 });
      }

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
      void chat.processMessage(adapter as unknown as Adapter, data.threadId, message, options);

      return new Response(null, { status: 202 });
    }),
    fetchThread: vi.fn((id: string) =>
      Promise.resolve({ id, channelId: id.split(':')[0], metadata: {} }),
    ),
    channelIdFromThreadId: (id: string) => id.split(':')[0],
    isDM: (id: string) => id.startsWith('dm'),
    stream: vi.fn(async (threadId: string, stream: AsyncIterable<string>) => {
      let text = '';

      for await (const chunk of stream) text += chunk;

      posted.push({ threadId, text });

      return { id: 'reply', threadId, raw: {} };
    }),
  };

  const identity = vi.fn((): Promise<FrogBotRequest['user']> => Promise.resolve(null));
  const piece = definePiece({
    slug,
    label: slug,
    auth: z.object({ token: z.string() }),
    client: () => client,
    actions: [],
    channel: {
      adapter: () => suppliedAdapter ?? (adapter as unknown as Adapter),
      identity,
      ...(questions ? { questions } : {}),
    },
  })({ auth: { token: 'secret' } });

  const inputs: ChannelTaskInput[] = [];
  const queue = vi.fn(({ input }: { input: ChannelTaskInput }) => {
    inputs.push(input);

    return Promise.resolve();
  });

  const streamMessage = vi.fn((_opts: AgentStreamMessageOpts) =>
    Promise.resolve({
      stream: asyncChunks('Hello back'),
      persistence: Promise.resolve(),
    }),
  );

  const access = vi.fn(() => true);
  const chats = new Map<string, { id: string }>();
  const messages: Array<Record<string, unknown>> = [];

  const frogbot = {
    agents: {
      support: {
        slug: 'support',
        config: {
          channels: [piece],
          access,
          model: { default: 'openai/test', options: ['openai/test'] },
        },
        aiAgent: { tools: {} },
        streamMessage,
      },
    },
    config: {
      chat: { enabled: true, chatsSlug: 'chats', messagesSlug: 'messages' },
      _internal: { triggers: {}, payloadConfig: Promise.resolve({ admin: { user: 'users' } }) },
    },
    connections: {
      resolvePieceCredential: vi.fn(() => Promise.resolve({ auth: { token: 'secret' }, key: {} })),
    },
    createRequest: vi.fn((req: { context?: object }) =>
      Promise.resolve(Object.assign(req, { context: req.context ?? {}, frogbot })),
    ),
    find: vi.fn(({ collection, where }: { collection: string; where: FixtureWhere }) => {
      if (collection === 'messages') {
        return Promise.resolve({
          docs: messages.filter((message) => matchesWhere(message, where)),
        });
      }

      const channelKey = (where as { channelKey: { equals: string } }).channelKey.equals;

      return Promise.resolve({ docs: chats.has(channelKey) ? [chats.get(channelKey)] : [] });
    }),
    findByID: vi.fn(({ collection, id }: { collection: string; id: string }) =>
      Promise.resolve(
        collection === 'chats'
          ? ([...chats.values()].find((chat) => chat.id === id) ?? null)
          : { id },
      ),
    ),
    create: vi.fn(({ data }: { data: { channelKey: string } }) => {
      const row = { ...data, id: `chat-${chats.size + 1}` };

      chats.set(data.channelKey, row);

      return Promise.resolve(row);
    }),
    logger: { debug: vi.fn(), info: vi.fn(), error: vi.fn() },
    kv,
    queue,
  };

  const host = new ChannelHost(frogbot as never);
  const interact = (body: Record<string, unknown>) =>
    host.webhook(
      slug,
      new Request('http://localhost/webhook', { method: 'POST', body: JSON.stringify(body) }),
    );
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
    interact,
    streamMessage,
    posted,
    identity,
    access,
    messages,
  };
}

type FixtureWhere = {
  and?: Array<Record<string, { equals?: unknown; not_equals?: unknown }>>;
};

function matchesWhere(doc: Record<string, unknown>, where: FixtureWhere): boolean {
  return (where.and ?? []).every((clause) =>
    Object.entries(clause).every(([field, operator]) =>
      'equals' in operator ? doc[field] === operator.equals : doc[field] !== operator.not_equals,
    ),
  );
}

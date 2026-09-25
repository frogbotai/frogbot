import type { Adapter } from 'chat';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hasChannelChatAccess } from '../../../../packages/frogbot/src/chat/channelAccess.js';
import { channelFixture, deferred } from './helpers.js';

const { claimTurn, releaseTurn, streamTurn, updateIfVersion } = vi.hoisted(() => ({
  claimTurn: vi.fn(),
  releaseTurn: vi.fn(),
  streamTurn: vi.fn(),
  updateIfVersion: vi.fn(),
}));

vi.mock('../../../../packages/frogbot/src/chat/turn/state.js', () => ({ claimTurn, releaseTurn }));

vi.mock('../../../../packages/frogbot/src/chat/turn/streamTurn.js', () => ({ streamTurn }));

vi.mock('../../../../packages/frogbot/src/database/compareAndSet.js', () => ({ updateIfVersion }));

const { getChannelHost, initializeChannelHost, shutdownChannelHost } =
  await import('../../../../packages/frogbot/src/channels/host.js');

const { runQueuedTurn } = await import('../../../../packages/frogbot/src/chat/turn/queue.js');

const claim = { chatId: 'chat-1', attempt: 'attempt-1' };

function activate(messages: Array<Record<string, unknown>>) {
  return async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
    Object.assign(
      messages.find((message) => message.id === id)!,
      data,
    );

    return true;
  };
}

describe('ChannelHost initialization cleanup', () => {
  it.each([
    { registered: false, cleanupFails: false },
    { registered: false, cleanupFails: true },
    { registered: true, cleanupFails: false },
    { registered: true, cleanupFails: true },
  ])(
    'drains both adapters and preserves the boot error (%j)',
    async ({ registered, cleanupFails }) => {
      const failure = new Error('second adapter initialization failed');
      const cleanup = deferred();
      const connected = new Set<string>();
      const startGatewayListener = vi.fn();
      const adapters = ['first', 'second'].map((name) => ({
        name,
        initialize: vi.fn(async () => {
          connected.add(name);

          if (name === 'second') throw failure;
        }),
        disconnect: vi.fn(async () => {
          await cleanup.promise;

          connected.delete(name);

          if (cleanupFails) throw new Error(`${name} disconnect failed`);
        }),
        startGatewayListener,
      }));
      const first = channelFixture({ slug: 'first', adapter: adapters[0] as unknown as Adapter });
      const second = channelFixture({ slug: 'second', adapter: adapters[1] as unknown as Adapter });

      first.frogbot.agents.support.config.channels.push(
        ...second.frogbot.agents.support.config.channels,
      );

      let settled = false;
      const initialization = registered
        ? initializeChannelHost(first.frogbot as never)
        : first.host.initialize();
      const outcome = initialization.catch((error: unknown) => {
        settled = true;

        return error;
      });

      try {
        await vi.waitFor(() => {
          expect(adapters[0]!.disconnect).toHaveBeenCalledOnce();
          expect(adapters[1]!.disconnect).toHaveBeenCalledOnce();
        });

        expect(connected).toEqual(new Set(['first', 'second']));
        expect(settled).toBe(false);
        expect(getChannelHost(first.frogbot as never)).toBeUndefined();
        expect(startGatewayListener).not.toHaveBeenCalled();
      } finally {
        cleanup.resolve();

        await outcome;
      }

      expect(await outcome).toBe(failure);
      expect(connected.size).toBe(0);
      expect(getChannelHost(first.frogbot as never)).toBeUndefined();

      if (registered) {
        await shutdownChannelHost(first.frogbot as never);
      } else {
        await expect(
          first.host.webhook('first', new Request('http://localhost/webhook')),
        ).resolves.toBeUndefined();
        await first.host.shutdown();
      }

      expect(adapters[0]!.disconnect).toHaveBeenCalledOnce();
      expect(adapters[1]!.disconnect).toHaveBeenCalledOnce();
    },
  );
});

describe('ChannelHost conversation loop', () => {
  beforeEach(() => {
    claimTurn.mockReset().mockResolvedValue(claim);
    releaseTurn.mockReset().mockResolvedValue(true);
    updateIfVersion.mockReset().mockResolvedValue(true);

    streamTurn.mockReset().mockImplementation(async () => ({
      result: {
        stream: (async function* () {
          yield 'Queued reply';
        })(),
      },
      persistence: Promise.resolve(),
    }));
  });

  it('waits for durable enqueue and retains every concurrent turn', async () => {
    const fixture = channelFixture();
    const held = deferred();

    fixture.queue.mockImplementation(async ({ input }) => {
      await held.promise;

      fixture.inputs.push(input);
    });

    await fixture.host.initialize(false);

    let acknowledged = false;
    const deliveries = Promise.all(
      Array.from({ length: 12 }, (_, index) => fixture.deliver(`message-${index}`)),
    ).then(() => {
      acknowledged = true;
    });

    await vi.waitFor(() => expect(fixture.queue).toHaveBeenCalledTimes(12));

    expect(acknowledged).toBe(false);

    held.resolve();
    await deliveries;
    await fixture.deliver('message-0');

    expect(new Set(fixture.inputs.map((input) => input.message.id)).size).toBe(12);
    expect(fixture.queue).toHaveBeenCalledTimes(12);

    await fixture.host.shutdown();
  });

  it('propagates enqueue failures from real adapter callbacks', async () => {
    const fixture = channelFixture();

    fixture.queue.mockRejectedValue(new Error('queue unavailable'));

    await fixture.host.initialize(false);

    await expect(fixture.deliver()).rejects.toThrow('Channel webhook processing failed');

    await fixture.host.shutdown();
  });

  it('rehydrates threads with each host state and grants access to the trusted conversation', async () => {
    const first = channelFixture();
    const second = channelFixture();

    first.identity.mockResolvedValueOnce({ id: 'owner', collection: 'users' } as never);

    await first.host.initialize(false);
    await second.host.initialize(false);
    await first.deliver();
    await first.host.run(JSON.parse(JSON.stringify(first.inputs[0])));

    expect(first.values.get('channels:support:slack:subscription:channel:thread-1')).toBe(true);
    expect(second.values.has('channels:support:slack:subscription:channel:thread-1')).toBe(false);
    expect(first.posted).toEqual([{ threadId: 'channel:thread-1', text: 'Hello back' }]);

    const opts = first.streamMessage.mock.calls[0]![0];
    const chat = first.frogbot.create.mock.calls[0]![0].data;

    expect(opts.overrideAccess).toBe(true);
    expect(
      hasChannelChatAccess({
        access: opts.channelAccess!,
        req: opts.req!,
        agentSlug: 'support',
        chat: { ...chat, id: opts.chatId!, agent: 'support' },
      }),
    ).toBe(true);

    first.identity.mockResolvedValueOnce({ id: 'participant', collection: 'users' } as never);

    await first.deliver('message-2', 'channel:thread-1', { mention: false, author: 'user-2' });
    await first.host.run(first.inputs[1]!);
    await second.deliver();
    await second.host.run(second.inputs[0]!);

    expect(first.streamMessage.mock.calls.map(([call]) => call.chatId)).toEqual([
      'chat-1',
      'chat-1',
    ]);
    expect(first.streamMessage.mock.calls.map(([call]) => call.req?.user?.id)).toEqual([
      'owner',
      'participant',
    ]);
    expect(second.posted).toHaveLength(1);

    await first.host.shutdown();
    await second.host.shutdown();
  });

  it('keeps distinct DM threads and peers isolated', async () => {
    const fixture = channelFixture();

    await fixture.host.initialize(false);

    for (const [index, thread] of [
      'dm-peer-1:thread-1',
      'dm-peer-1:thread-2',
      'dm-peer-2:thread-1',
    ].entries()) {
      await fixture.deliver(`message-${index}`, thread, { mention: false });
      await fixture.host.run(fixture.inputs[index]!);
    }

    expect(new Set(fixture.streamMessage.mock.calls.map(([call]) => call.chatId)).size).toBe(3);

    await fixture.host.shutdown();
  });

  it('queues a message that arrives during a running turn without posting it', async () => {
    const fixture = channelFixture();

    await fixture.host.initialize(false);
    await fixture.deliver('message-1');
    await fixture.deliver('message-2');
    await fixture.host.run(fixture.inputs[0]!);

    fixture.streamMessage.mockResolvedValueOnce({
      status: 'queued',
      chatId: 'chat-1',
      messageId: 'message-2',
      delivery: 'queue',
    } as never);

    await fixture.host.run(fixture.inputs[1]!);

    expect(fixture.streamMessage).toHaveBeenCalledTimes(2);
    expect(fixture.posted).toEqual([{ threadId: 'channel:thread-1', text: 'Hello back' }]);

    await fixture.host.shutdown();
  });

  it('posts a promoted queued turn once through the registered runner', async () => {
    const fixture = channelFixture();

    updateIfVersion.mockImplementation(activate(fixture.messages));

    await fixture.host.initialize(false);
    await fixture.deliver('message-1');
    await fixture.host.run(fixture.inputs[0]!);

    fixture.messages.push({
      id: 'message-2',
      chat: 'chat-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Also this' }],
      status: 'queued',
      delivery: 'queue',
      author: { user: null, channel: { piece: 'slack', id: 'user-2', username: 'toad' } },
      version: 0,
      createdAt: '2026-09-24T00:00:00.000Z',
    });

    await runQueuedTurn({ frogbot: fixture.frogbot as never, chatId: 'chat-1' });

    expect(fixture.messages[0]).toMatchObject({ status: 'active', delivery: null });
    expect(streamTurn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        agent: fixture.frogbot.agents.support,
        claim,
        uiMessages: [
          { id: 'message-2', role: 'user', parts: [{ type: 'text', text: 'Also this' }] },
        ],
        clientTools: { kinds: [] },
        req: expect.objectContaining({
          context: {
            channel: {
              piece: 'slack',
              threadId: 'channel:thread-1',
              author: { id: 'user-2', username: 'toad' },
            },
          },
        }),
      }),
    );
    expect(fixture.streamMessage).toHaveBeenCalledOnce();
    expect(fixture.posted).toEqual([
      { threadId: 'channel:thread-1', text: 'Hello back' },
      { threadId: 'channel:thread-1', text: 'Queued reply' },
    ]);
    expect(releaseTurn).not.toHaveBeenCalled();

    await fixture.host.shutdown();
  });

  it('stops posting promoted turns once the host shuts down', async () => {
    const fixture = channelFixture();

    updateIfVersion.mockImplementation(activate(fixture.messages));

    await fixture.host.initialize(false);
    await fixture.deliver('message-1');
    await fixture.host.run(fixture.inputs[0]!);
    await fixture.host.shutdown();

    fixture.messages.push({
      id: 'message-2',
      chat: 'chat-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Also this' }],
      status: 'queued',
      delivery: 'queue',
      author: { user: null },
      version: 0,
      createdAt: '2026-09-24T00:00:00.000Z',
    });

    await runQueuedTurn({ frogbot: fixture.frogbot as never, chatId: 'chat-1' });

    expect(streamTurn).toHaveBeenCalledOnce();
    expect(fixture.posted).toEqual([{ threadId: 'channel:thread-1', text: 'Hello back' }]);
  });

  it('aborts and drains persistence after posting fails without retrying the turn', async () => {
    const fixture = channelFixture();
    const persisted = deferred();

    fixture.adapter.stream.mockRejectedValue(new Error('post failed'));
    fixture.streamMessage.mockResolvedValueOnce({
      stream: (async function* () {
        yield 'First';
      })(),
      persistence: persisted.promise,
    });

    await fixture.host.initialize(false);
    await fixture.deliver();

    let done = false;
    const outcome = fixture.host.run(fixture.inputs[0]!).catch((error: unknown) => {
      done = true;

      return error;
    });

    await vi.waitFor(() =>
      expect(fixture.streamMessage.mock.calls[0]?.[0].abortSignal?.aborted).toBe(true),
    );

    expect(done).toBe(false);

    persisted.resolve();

    expect(await outcome).toEqual(new Error('post failed'));
    expect(fixture.streamMessage).toHaveBeenCalledOnce();

    await fixture.host.shutdown();
  });

  it('propagates persistence failures and never retries errors raised inside the turn', async () => {
    const fixture = channelFixture();
    const error = Object.assign(new Error('turn failed'), { name: 'KVLockContentionError' });

    fixture.streamMessage.mockImplementationOnce(async () => {
      const persistence = Promise.reject(error);

      void persistence.catch(() => {});

      return {
        stream: (async function* () {
          yield 'Reply';
        })(),
        persistence,
      };
    });

    await fixture.host.initialize(false);
    await fixture.deliver();

    await expect(fixture.host.run(fixture.inputs[0]!)).rejects.toBe(error);

    expect(fixture.streamMessage).toHaveBeenCalledOnce();

    await fixture.host.shutdown();
  });

  it('silently audits denied access and rejects unavailable task bindings', async () => {
    const fixture = channelFixture();

    fixture.access.mockReturnValue(false);

    await fixture.host.initialize(false);
    await fixture.deliver();
    await fixture.host.run(fixture.inputs[0]!);

    expect(fixture.frogbot.logger.info).toHaveBeenCalledOnce();
    expect(fixture.streamMessage).not.toHaveBeenCalled();
    expect(fixture.frogbot.find).not.toHaveBeenCalled();

    await expect(
      fixture.host.run({ ...fixture.inputs[0]!, instanceSlug: 'missing' }),
    ).rejects.toThrow('unavailable');
    await expect(fixture.host.run({ ...fixture.inputs[0]!, agentSlug: 'other' })).rejects.toThrow(
      'unavailable',
    );
    await expect(
      fixture.host.run({
        ...fixture.inputs[0]!,
        thread: { ...fixture.inputs[0]!.thread, adapterName: 'other' },
      }),
    ).rejects.toThrow('adapter');

    await fixture.host.shutdown();
  });
});

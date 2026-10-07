import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import type { Adapter } from '../../../../packages/frogbot/node_modules/chat/dist/index.js';
import { hasChannelChatAccess } from '../../../../packages/frogbot/src/chat/channelAccess.js';
import { asyncChunks, channelFixture, deferred } from './helpers.js';

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
  return ({ id, data }: { id: string; data: Record<string, unknown> }) => {
    Object.assign(
      messages.find((message) => message.id === id)!,
      data,
    );

    return Promise.resolve(true);
  };
}

type Fixture = ReturnType<typeof channelFixture>;

const lifecycles = {
  registered: {
    initialize: (fixture: Fixture) => initializeChannelHost(fixture.frogbot as never),
    finish: (fixture: Fixture) => shutdownChannelHost(fixture.frogbot as never),
  },
  local: {
    initialize: (fixture: Fixture) => fixture.host.initialize(),
    finish: async (fixture: Fixture) => {
      await expect(
        fixture.host.webhook('first', new Request('http://localhost/webhook')),
      ).resolves.toBeUndefined();

      await fixture.host.shutdown();
    },
  },
};

describe('ChannelHost initialization cleanup', () => {
  it.each([
    { lifecycle: 'local', cleanupFails: false },
    { lifecycle: 'local', cleanupFails: true },
    { lifecycle: 'registered', cleanupFails: false },
    { lifecycle: 'registered', cleanupFails: true },
  ] as const)(
    'drains both adapters and preserves the boot error (%j)',
    async ({ lifecycle, cleanupFails }) => {
      const failure = new Error('second adapter initialization failed');
      const cleanup = deferred();
      const connected = new Set<string>();
      const startGatewayListener = vi.fn();
      const adapters = ['first', 'second'].map((name) => ({
        name,
        initialize: vi.fn(() => {
          connected.add(name);

          return name === 'second' ? Promise.reject(failure) : Promise.resolve();
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
      const initialization = lifecycles[lifecycle].initialize(first);
      const outcome = initialization.catch((error: unknown) => {
        settled = true;

        return error;
      });

      onTestFinished(async () => {
        cleanup.resolve();

        await outcome;
      });

      await vi.waitFor(() => {
        expect(adapters[0].disconnect).toHaveBeenCalledOnce();
        expect(adapters[1].disconnect).toHaveBeenCalledOnce();
      });

      expect(connected).toEqual(new Set(['first', 'second']));
      expect(settled).toBe(false);
      expect(getChannelHost(first.frogbot as never)).toBeUndefined();
      expect(startGatewayListener).not.toHaveBeenCalled();

      cleanup.resolve();

      expect(await outcome).toBe(failure);
      expect(connected.size).toBe(0);
      expect(getChannelHost(first.frogbot as never)).toBeUndefined();

      await lifecycles[lifecycle].finish(first);

      expect(adapters[0].disconnect).toHaveBeenCalledOnce();
      expect(adapters[1].disconnect).toHaveBeenCalledOnce();
    },
  );
});

describe('ChannelHost conversation loop', () => {
  beforeEach(() => {
    claimTurn.mockReset().mockResolvedValue(claim);
    releaseTurn.mockReset().mockResolvedValue(true);
    updateIfVersion.mockReset().mockResolvedValue(true);

    streamTurn.mockReset().mockImplementation(() =>
      Promise.resolve({
        result: { stream: asyncChunks('Queued reply') },
        persistence: Promise.resolve(),
      }),
    );
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

    expect(
      new Set(fixture.inputs.flatMap((input) => ('message' in input ? [input.message.id] : [])))
        .size,
    ).toBe(12);
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

    first.identity.mockResolvedValueOnce({ id: 'owner', collection: 'users' });

    await first.host.initialize(false);
    await second.host.initialize(false);
    await first.deliver();
    await first.host.run(JSON.parse(JSON.stringify(first.inputs[0])));

    expect(first.values.get('channels:support:slack:subscription:channel:thread-1')).toBe(true);
    expect(second.values.has('channels:support:slack:subscription:channel:thread-1')).toBe(false);
    expect(first.posted).toEqual([{ threadId: 'channel:thread-1', text: 'Hello back' }]);

    const opts = first.streamMessage.mock.calls[0][0];
    const chat = first.frogbot.create.mock.calls[0][0].data;

    expect(opts.overrideAccess).toBe(true);
    expect(
      hasChannelChatAccess({
        access: opts.channelAccess!,
        req: opts.req!,
        agentSlug: 'support',
        chat: { ...chat, id: opts.chatId, agent: 'support' },
      }),
    ).toBe(true);

    first.identity.mockResolvedValueOnce({ id: 'participant', collection: 'users' });

    await first.deliver('message-2', 'channel:thread-1', { mention: false, author: 'user-2' });
    await first.host.run(first.inputs[1]);
    await second.deliver();
    await second.host.run(second.inputs[0]);

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
      await fixture.host.run(fixture.inputs[index]);
    }

    expect(new Set(fixture.streamMessage.mock.calls.map(([call]) => call.chatId)).size).toBe(3);

    await fixture.host.shutdown();
  });

  it('queues a message that arrives during a running turn without posting it', async () => {
    const fixture = channelFixture();

    await fixture.host.initialize(false);
    await fixture.deliver('message-1');
    await fixture.deliver('message-2');
    await fixture.host.run(fixture.inputs[0]);

    fixture.streamMessage.mockResolvedValueOnce({
      status: 'queued',
      chatId: 'chat-1',
      messageId: 'message-2',
      delivery: 'queue',
    } as never);

    await fixture.host.run(fixture.inputs[1]);

    expect(fixture.streamMessage).toHaveBeenCalledTimes(2);
    expect(fixture.posted).toEqual([{ threadId: 'channel:thread-1', text: 'Hello back' }]);

    await fixture.host.shutdown();
  });

  it('posts a promoted queued turn once through the registered runner', async () => {
    const fixture = channelFixture();

    updateIfVersion.mockImplementation(activate(fixture.messages));

    await fixture.host.initialize(false);
    await fixture.deliver('message-1');
    await fixture.host.run(fixture.inputs[0]);

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
    await fixture.host.run(fixture.inputs[0]);
    await fixture.host.shutdown();

    fixture.messages.push({
      id: 'message-2',
      chat: 'chat-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Also this' }],
      status: 'queued',
      delivery: 'queue',
      author: { user: null, channel: { piece: 'slack', account: 'slack', id: 'user-1' } },
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
      stream: asyncChunks('First'),
      persistence: persisted.promise,
    });

    await fixture.host.initialize(false);
    await fixture.deliver();

    let done = false;
    const outcome = fixture.host.run(fixture.inputs[0]).catch((error: unknown) => {
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

    fixture.streamMessage.mockImplementationOnce(() => {
      const persistence = Promise.reject(error);

      void persistence.catch(() => {});

      return Promise.resolve({ stream: asyncChunks('Reply'), persistence });
    });

    await fixture.host.initialize(false);
    await fixture.deliver();

    await expect(fixture.host.run(fixture.inputs[0])).rejects.toBe(error);

    expect(fixture.streamMessage).toHaveBeenCalledOnce();

    await fixture.host.shutdown();
  });

  it('silently audits denied access and rejects unavailable task bindings', async () => {
    const fixture = channelFixture();

    fixture.access.mockReturnValue(false);

    await fixture.host.initialize(false);
    await fixture.deliver();
    await fixture.host.run(fixture.inputs[0]);

    expect(fixture.frogbot.logger.info).toHaveBeenCalledOnce();
    expect(fixture.streamMessage).not.toHaveBeenCalled();
    expect(fixture.frogbot.find).not.toHaveBeenCalled();

    await expect(
      fixture.host.run({ ...fixture.inputs[0], instanceSlug: 'missing' }),
    ).rejects.toThrow('unavailable');
    await expect(fixture.host.run({ ...fixture.inputs[0], agentSlug: 'other' })).rejects.toThrow(
      'unavailable',
    );
    await expect(
      fixture.host.run({
        ...fixture.inputs[0],
        thread: { ...fixture.inputs[0].thread, adapterName: 'other' },
      }),
    ).rejects.toThrow('adapter');

    await fixture.host.shutdown();
  });

  it('silently audits an identified user with no usable model', async () => {
    const fixture = channelFixture();

    fixture.identity.mockResolvedValueOnce({
      id: 'user-1',
      collection: 'users',
      modelAccess: 'selected',
      models: ['openai/other'],
    });

    await fixture.host.initialize(false);
    await fixture.deliver();
    await fixture.host.run(fixture.inputs[0]);

    expect(fixture.frogbot.logger.info).toHaveBeenCalledExactlyOnceWith(
      { agent: 'support', piece: 'slack', author: 'user-1' },
      '[frogbot] Channel message denied by model access.',
    );
    expect(fixture.streamMessage).not.toHaveBeenCalled();
    expect(fixture.frogbot.find).not.toHaveBeenCalled();
    expect(fixture.frogbot.create).not.toHaveBeenCalled();
    expect(fixture.posted).toEqual([]);
    expect(fixture.frogbot.logger.error).not.toHaveBeenCalled();

    await fixture.host.shutdown();
  });

  it('runs an identified user with one usable model without selecting a model', async () => {
    const fixture = channelFixture();

    Object.assign(fixture.frogbot.agents.support.config, {
      model: { default: 'openai/test', options: ['openai/test', 'openai/other'] },
    });

    fixture.identity.mockResolvedValueOnce({
      id: 'user-1',
      collection: 'users',
      modelAccess: 'selected',
      models: ['openai/other'],
    });

    await fixture.host.initialize(false);
    await fixture.deliver();
    await fixture.host.run(fixture.inputs[0]);

    expect(fixture.streamMessage).toHaveBeenCalledOnce();
    expect(fixture.streamMessage.mock.calls[0][0]).not.toHaveProperty('selection');
    expect(fixture.streamMessage.mock.calls[0][0].req?.user).toMatchObject({
      id: 'user-1',
      modelAccess: 'selected',
      models: ['openai/other'],
    });
    expect(fixture.posted).toEqual([{ threadId: 'channel:thread-1', text: 'Hello back' }]);
    expect(fixture.frogbot.logger.info).not.toHaveBeenCalled();

    await fixture.host.shutdown();
  });

  it('runs a null user on an open agent without selecting a model', async () => {
    const fixture = channelFixture();

    await fixture.host.initialize(false);
    await fixture.deliver();
    await fixture.host.run(fixture.inputs[0]);

    expect(fixture.streamMessage).toHaveBeenCalledOnce();
    expect(fixture.streamMessage.mock.calls[0][0].req?.user).toBeNull();
    expect(fixture.streamMessage.mock.calls[0][0]).not.toHaveProperty('selection');
    expect(fixture.posted).toEqual([{ threadId: 'channel:thread-1', text: 'Hello back' }]);
    expect(fixture.frogbot.logger.info).not.toHaveBeenCalled();

    await fixture.host.shutdown();
  });
});

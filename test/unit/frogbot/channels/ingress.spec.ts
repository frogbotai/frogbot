import type { Adapter, ChatInstance } from 'chat';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { getChannelHost } from '../../../../packages/frogbot/src/channels/host.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import { channelFixture, deferred } from './helpers.js';
import { ingressFixture } from './ingress.js';

const fixtures: ReturnType<typeof ingressFixture>[] = [];

function fixture({ slug = 'adapter', conversational = false, verify = false } = {}) {
  const { adapter } = channelFixture();
  const disconnect = vi.fn(async () => {});
  const factory = vi.fn(() => ({ ...adapter, disconnect }) as unknown as Adapter);
  const instance = definePiece({
    slug,
    label: 'Adapter',
    actions: [],
    channel: { adapter: factory, identity: async () => null },
    webhook: {
      ...(verify ? { verify: async () => true } : {}),
      parse: () => ({ event: 'message' }),
    },
    triggers: [
      {
        slug: 'message',
        type: 'app',
        event: 'message',
        description: 'Receive messages',
        input: z.object({}),
        output: z.object({}),
        run: async () => [],
      },
    ],
  })();

  const result = ingressFixture({ instance, triggerSlugs: ['message'], conversational });

  fixtures.push(result);

  return { ...result, adapter, factory, disconnect };
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.shutdown()));
});

describe('ChannelHost ingress-only lifecycle', () => {
  it.each([false, true])('skips unnecessary bindings (%s)', async (verify) => {
    const { initialize, frogbot, factory } = fixture({ verify });

    if (!verify) frogbot.config._internal.triggers.adapter!.subscribers = [];

    await initialize();

    expect(factory).not.toHaveBeenCalled();
    expect(getChannelHost(frogbot as never)!.hasGatewayAdapters()).toBe(false);
  });

  it.each([false, true])('initializes once, channel = %s', async (conversational) => {
    const { initialize, shutdown, frogbot, adapter, factory, disconnect } = fixture({
      conversational,
    });

    await initialize();

    expect(factory).toHaveBeenCalledOnce();
    expect(adapter.initialize).toHaveBeenCalledOnce();

    const host = getChannelHost(frogbot as never)!;

    await host.webhook(
      'adapter',
      new Request('https://example.com', {
        method: 'POST',
        body: JSON.stringify({ id: 'message-1', threadId: 'dm:1' }),
      }),
    );

    expect(frogbot.queue).toHaveBeenCalledTimes(conversational ? 1 : 0);

    await shutdown();

    expect(disconnect).toHaveBeenCalledOnce();
    expect(getChannelHost(frogbot as never)).toBeUndefined();
  });

  it('keeps ingress-only state isolated by instance without needing a subscriber agent', async () => {
    const first = fixture({ slug: 'first' });
    const second = fixture({ slug: 'second' });

    Object.assign(
      first.frogbot.config._internal.triggers,
      second.frogbot.config._internal.triggers,
    );

    first.frogbot.agents = {} as typeof first.frogbot.agents;

    await first.initialize();

    expect(first.adapter.initialize).toHaveBeenCalledOnce();
    expect(second.adapter.initialize).toHaveBeenCalledOnce();

    const firstChat = first.adapter.initialize.mock.calls[0]![0] as ChatInstance;
    const secondChat = second.adapter.initialize.mock.calls[0]![0] as ChatInstance;

    await firstChat.getState().set('key', 'first');
    await secondChat.getState().set('key', 'second');

    expect(await firstChat.getState().get('key')).toBe('first');
    expect(await secondChat.getState().get('key')).toBe('second');
  });

  it('drains every initialized ingress adapter when a later initialization fails', async () => {
    const first = fixture({ slug: 'first' });
    const second = fixture({ slug: 'second' });
    const failure = new Error('adapter initialization failed');

    Object.assign(
      first.frogbot.config._internal.triggers,
      second.frogbot.config._internal.triggers,
    );

    second.adapter.initialize.mockRejectedValue(failure);

    await expect(first.initialize()).rejects.toBe(failure);

    expect(first.disconnect).toHaveBeenCalledOnce();
    expect(second.disconnect).toHaveBeenCalledOnce();
    expect(getChannelHost(first.frogbot as never)).toBeUndefined();
  });

  it.each([false, true])('owns one Gateway lifecycle, channel = %s', async (conversational) => {
    const result = fixture({ conversational });
    const started = deferred();
    const drain = deferred();
    let listenerSignal: AbortSignal | undefined;

    const startGatewayListener = vi.fn(
      async (_options: unknown, _duration: number, signal: AbortSignal, _webhookUrl: string) => {
        listenerSignal = signal;
        started.resolve();

        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        );
        await drain.promise;
      },
    );

    result.factory.mockImplementation(
      () =>
        ({
          ...result.adapter,
          disconnect: result.disconnect,
          startGatewayListener,
        }) as unknown as Adapter,
    );

    await result.initialize(true);

    const host = getChannelHost(result.frogbot as never)!;

    expect(host.hasGatewayAdapters()).toBe(true);

    await started.promise;

    expect(startGatewayListener).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ waitUntil: expect.any(Function) }),
      expect.any(Number),
      expect.any(AbortSignal),
      'https://example.com/api/webhooks/adapter',
    );

    const stopping = result.shutdown();

    try {
      expect(listenerSignal?.aborted).toBe(true);
      expect(result.disconnect).not.toHaveBeenCalled();
    } finally {
      drain.resolve();

      await stopping;
    }

    expect(result.disconnect).toHaveBeenCalledOnce();
  });
});

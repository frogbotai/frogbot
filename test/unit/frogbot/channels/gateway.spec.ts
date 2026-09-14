import type { Adapter } from 'chat';
import { describe, expect, it, vi } from 'vitest';

import { ChannelHost } from '../../../../packages/frogbot/src/channels/host.js';
import { runKVLock } from '../../../../packages/frogbot/src/kv/lock.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function gatewayFixture(adapters: object[]) {
  let held = false;
  const kv = {
    acquireLock: vi.fn(async () => {
      if (held) return null;

      held = true;

      return { key: 'gateway', token: 'owner' };
    }),
    extendLock: vi.fn(async () => held),
    releaseLock: vi.fn(async () => {
      held = false;

      return true;
    }),
    lock: <T>(key: string, ttl: number, fn: Parameters<typeof runKVLock<T>>[0]['fn']) =>
      runKVLock({ kv, key, ttl, fn }),
  };
  const host = new ChannelHost({ kv, getAPIURL: () => 'https://example.com/api' } as never);
  const shutdown = vi.fn(async () => {});

  adapters.forEach((adapter, index) => {
    (host as unknown as { bindings: Map<string, unknown> }).bindings.set(String(index), {
      adapter,
      chat: { shutdown },
      instance: { slug: String(index) },
    });
  });

  return { host, kv, shutdown };
}

describe('channel gateway listener', () => {
  it('elects one listener, forwards to canonical ingress, and permits takeover after drain', async () => {
    let held = false;
    const drained = deferred();
    const starts: Array<{ signal: AbortSignal; webhookUrl: string }> = [];
    const adapter = {
      name: 'gateway',
      startGatewayListener: vi.fn(
        async (_options: unknown, _duration: number, signal: AbortSignal, webhookUrl: string) => {
          starts.push({ signal, webhookUrl });

          await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
          await drained.promise;
        },
      ),
    } as unknown as Adapter;
    const kv = {
      lock: vi.fn(
        async (
          _key: string,
          _ttl: number,
          run: (args: { signal: AbortSignal }) => Promise<void>,
        ) => {
          if (held) {
            const error = new Error('held');

            error.name = 'KVLockContentionError';

            throw error;
          }

          held = true;

          try {
            await run({ signal: new AbortController().signal });
          } finally {
            held = false;
          }
        },
      ),
    };
    const frogbot = {
      getAPIURL: () => 'https://example.com/api',
      kv,
    };
    const first = new ChannelHost(frogbot as never);
    const second = new ChannelHost(frogbot as never);
    const binding = {
      adapter,
      agent: { slug: 'support' },
      chat: {},
      instance: { slug: 'discord' },
    };

    (first as unknown as { bindings: Map<string, unknown> }).bindings.set('discord', binding);
    (second as unknown as { bindings: Map<string, unknown> }).bindings.set('discord', binding);

    const firstController = new AbortController();
    const firstRun = first.runGatewayListener({
      durationMs: 60_000,
      signal: firstController.signal,
    });

    await vi.waitFor(() => expect(starts).toHaveLength(1));
    await expect(second.runGatewayListener({ durationMs: 60_000 })).resolves.toBe(false);

    firstController.abort();
    drained.resolve();

    await expect(firstRun).resolves.toBe(true);

    expect(starts[0]!.webhookUrl).toBe('https://example.com/api/webhooks/discord');

    const takeoverController = new AbortController();
    const takeover = second.runGatewayListener({
      durationMs: 60_000,
      signal: takeoverController.signal,
    });

    await vi.waitFor(() => expect(starts).toHaveLength(2));

    takeoverController.abort();

    await expect(takeover).resolves.toBe(true);
  });

  it('does no KV work without a gateway adapter', async () => {
    const kv = { lock: vi.fn() };
    const host = new ChannelHost({ kv } as never);

    await expect(host.runGatewayListener({ durationMs: 1000 })).resolves.toBe(false);

    expect(kv.lock).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'aborts and drains sibling listeners on failure (sync: %s)',
    async (sync) => {
      const failure = new Error('listener failed');
      const drain = deferred();
      let listenerSignal: AbortSignal | undefined;
      const { host, kv } = gatewayFixture([
        {
          startGatewayListener: () => {
            if (sync) throw failure;

            return Promise.reject(failure);
          },
        },
        {
          startGatewayListener: async (
            _options: unknown,
            _duration: number,
            signal: AbortSignal,
          ) => {
            listenerSignal = signal;

            await drain.promise;
          },
        },
      ]);
      const run = host.runGatewayListener({ durationMs: 60_000 });
      const result = run.catch((error: unknown) => error);

      try {
        await vi.waitFor(() => expect(listenerSignal?.aborted).toBe(true));

        expect(kv.releaseLock).not.toHaveBeenCalled();
      } finally {
        drain.resolve();

        await result;
      }

      expect(await result).toBe(failure);
      expect(kv.releaseLock).toHaveBeenCalledOnce();
    },
  );

  it('drains work registered by other background work before releasing the lease', async () => {
    const first = deferred();
    const second = deferred();
    const registered = deferred();
    const { host, kv } = gatewayFixture([
      {
        startGatewayListener: async ({ waitUntil }: { waitUntil(task: Promise<void>): void }) => {
          waitUntil(
            first.promise.then(() => {
              waitUntil(second.promise);
              registered.resolve();
            }),
          );
        },
      },
    ]);
    const run = host.runGatewayListener({ durationMs: 60_000 });

    await vi.waitFor(() => expect(kv.acquireLock).toHaveBeenCalledOnce());

    first.resolve();
    await registered.promise;
    await setImmediate();

    try {
      expect(kv.releaseLock).not.toHaveBeenCalled();
    } finally {
      second.resolve();

      await run;
    }
  });

  it('waits for listener cleanup after losing the lease', async () => {
    vi.useFakeTimers();

    const started = deferred();
    const drain = deferred();
    let listenerSignal: AbortSignal | undefined;
    const { host, kv } = gatewayFixture([
      {
        startGatewayListener: async (_options: unknown, _duration: number, signal: AbortSignal) => {
          listenerSignal = signal;
          started.resolve();

          await drain.promise;
        },
      },
    ]);

    kv.extendLock.mockResolvedValue(false);

    let settled = false;
    const run = host.runGatewayListener({ durationMs: 60_000 }).catch((error: unknown) => error);

    void run.then(() => {
      settled = true;
    });

    try {
      await started.promise;
      await vi.advanceTimersByTimeAsync(10_000);

      expect(listenerSignal?.aborted).toBe(true);
      expect(settled).toBe(false);
    } finally {
      drain.resolve();

      await run;

      vi.useRealTimers();
    }

    expect(await run).toMatchObject({ name: 'KVLeaseLostError' });
  });

  it('aborts and drains a manually started listener before shutting down adapters', async () => {
    const started = deferred();
    const drain = deferred();
    let listenerSignal: AbortSignal | undefined;
    const { host, shutdown } = gatewayFixture([
      {
        startGatewayListener: async (_options: unknown, _duration: number, signal: AbortSignal) => {
          listenerSignal = signal;
          started.resolve();

          await drain.promise;
        },
      },
    ]);
    const run = host.runGatewayListener({ durationMs: 60_000 });

    await started.promise;

    const stopping = host.shutdown();

    try {
      expect(listenerSignal?.aborted).toBe(true);
      expect(shutdown).not.toHaveBeenCalled();
    } finally {
      drain.resolve();

      await Promise.all([run, stopping]);
    }

    expect(shutdown).toHaveBeenCalledOnce();
  });

  it('waits for lease release before shutting down adapters', async () => {
    const releasing = deferred();
    const released = deferred();
    const { host, kv, shutdown } = gatewayFixture([{ startGatewayListener: async () => {} }]);

    kv.releaseLock.mockImplementation(async () => {
      releasing.resolve();

      await released.promise;

      return true;
    });

    const run = host.runGatewayListener({ durationMs: 60_000 });

    await releasing.promise;

    const stopping = host.shutdown();

    await setImmediate();

    try {
      expect(shutdown).not.toHaveBeenCalled();
    } finally {
      released.resolve();

      await Promise.all([run, stopping]);
    }

    expect(shutdown).toHaveBeenCalledOnce();
  });

  it('does not start a listener for an already aborted request', async () => {
    const startGatewayListener = vi.fn();
    const { host } = gatewayFixture([{ startGatewayListener }]);

    await expect(
      host.runGatewayListener({
        durationMs: 60_000,
        signal: AbortSignal.abort(),
      }),
    ).resolves.toBe(true);

    expect(startGatewayListener).not.toHaveBeenCalled();
  });

  it('does not hide background failures when the caller aborts', async () => {
    const controller = new AbortController();
    const failure = new Error('forwarding failed');
    const { host } = gatewayFixture([
      {
        startGatewayListener: async ({ waitUntil }: { waitUntil(task: Promise<void>): void }) => {
          waitUntil(Promise.reject(failure));
          controller.abort();
        },
      },
    ]);

    await expect(
      host.runGatewayListener({ durationMs: 60_000, signal: controller.signal }),
    ).rejects.toMatchObject({ errors: [failure] });
  });
});
import { setImmediate } from 'node:timers/promises';

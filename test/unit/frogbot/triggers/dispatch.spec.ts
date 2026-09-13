import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  KVLeaseLostError,
  KVLockContentionError,
} from '../../../../packages/frogbot/src/kv/errors.js';
import { createKV } from '../../../../packages/frogbot/src/kv/index.js';
import { kvAtomic } from '../../../../packages/frogbot/src/kv/types.js';
import { dispatchTriggerEvents } from '../../../../packages/frogbot/src/triggers/dispatch.js';
import type { TriggerSubscriber } from '../../../../packages/frogbot/src/triggers/types.js';

function recipient({ agent = 'ops', instance = 'echo', trigger = 'received' } = {}) {
  return {
    agentSlug: agent,
    piece: { slug: instance },
    trigger: { trigger: { slug: trigger } },
    input: {},
  } as TriggerSubscriber;
}

function runtime() {
  const values = new Map<string, { value: unknown; expires: number }>();
  const get = (key: string) => {
    const entry = values.get(key);
    return entry && entry.expires > Date.now() ? entry.value : undefined;
  };
  const adapter = {
    [kvAtomic]: true as const,
    get: vi.fn(async (key: string) => get(key)),
    has: vi.fn(async (key: string) => get(key) !== undefined),
    set: vi.fn(async (key: string, value: unknown, { ttl = Infinity } = {}) => {
      values.set(key, { value, expires: Date.now() + ttl });
    }),
    setIfAbsent: vi.fn(async (key: string, value: unknown, { ttl = Infinity } = {}) => {
      if (get(key) !== undefined) return false;
      values.set(key, { value, expires: Date.now() + ttl });
      return true;
    }),
    extendLock: vi.fn(async ({ key, token }, ttl: number) => {
      if (get(key) !== token) return false;
      values.set(key, { value: token, expires: Date.now() + ttl });
      return true;
    }),
    releaseLock: vi.fn(async ({ key, token }) => {
      if (get(key) !== token) return false;
      values.delete(key);
      return true;
    }),
    delete: vi.fn(async (key: string) => {
      values.delete(key);
    }),
    clear: vi.fn(),
    keys: vi.fn(),
  };
  return {
    adapter,
    kv: createKV({ adapter: adapter as never }),
    queue: vi.fn().mockResolvedValue(undefined),
  };
}

const events = [{ dedupeKey: 'delivery-1', data: { message: 'hello' } }];
const dispatch = (frogbot: ReturnType<typeof runtime>, subscribers = [recipient()]) =>
  dispatchTriggerEvents({ events, frogbot: frogbot as never, subscribers });

describe('dispatchTriggerEvents', () => {
  afterEach(() => vi.useRealTimers());

  it('deduplicates independently for each agent, instance, and trigger', async () => {
    const frogbot = runtime();
    const subscribers = [
      recipient(),
      recipient({ agent: 'audit' }),
      recipient({ instance: 'other' }),
      recipient({ trigger: 'updated' }),
    ];
    for (const subscriber of subscribers) await dispatch(frogbot, [subscriber]);
    await dispatch(frogbot, subscribers);
    expect(frogbot.queue).toHaveBeenCalledTimes(4);
    expect(frogbot.adapter.setIfAbsent).toHaveBeenCalledWith(
      expect.stringContaining('trigger:dedupe:'),
      true,
      { ttl: 86_400_000 },
    );
  });

  it('expires successful deliveries after 24 hours', async () => {
    vi.useFakeTimers();
    const frogbot = runtime();
    await dispatch(frogbot);
    await vi.advanceTimersByTimeAsync(86_399_999);
    await dispatch(frogbot);
    expect(frogbot.queue).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await dispatch(frogbot);
    expect(frogbot.queue).toHaveBeenCalledTimes(2);
  });

  it('retries failed recipients without re-enqueueing successful recipients', async () => {
    const frogbot = runtime();
    frogbot.queue.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('queue down'));
    const subscribers = [recipient(), recipient({ agent: 'audit' })];
    await expect(dispatch(frogbot, subscribers)).rejects.toThrow('queue down');
    await dispatch(frogbot, subscribers);
    expect(frogbot.queue.mock.calls.map(([job]) => job.input.agentSlug)).toEqual([
      'ops',
      'audit',
      'audit',
    ]);
    expect(frogbot.adapter.delete).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'keeps concurrent deliveries retryable while enqueue is pending (fails: %s)',
    async (fails) => {
      const frogbot = runtime();
      const started = Promise.withResolvers<void>();
      const queued = Promise.withResolvers<void>();
      frogbot.queue.mockImplementationOnce(() => {
        started.resolve();
        return queued.promise;
      });
      const first = dispatch(frogbot);
      const firstResult = first.catch((error: unknown) => error);
      await started.promise;
      await expect(dispatch(frogbot)).rejects.toBeInstanceOf(KVLockContentionError);
      expect(frogbot.queue).toHaveBeenCalledTimes(1);
      if (fails) queued.reject(new Error('queue down'));
      else queued.resolve();
      if (fails) expect(await firstResult).toEqual(new Error('queue down'));
      else expect(await firstResult).toBeUndefined();
      await dispatch(frogbot);
      expect(frogbot.queue).toHaveBeenCalledTimes(fails ? 2 : 1);
      expect(frogbot.adapter.delete).not.toHaveBeenCalled();
    },
  );

  it('renews the enqueue lock and refuses concurrent delivery after its initial lease', async () => {
    vi.useFakeTimers();
    const frogbot = runtime();
    const started = Promise.withResolvers<void>();
    const queued = Promise.withResolvers<void>();
    frogbot.queue.mockImplementationOnce(() => {
      started.resolve();
      return queued.promise;
    });
    const first = dispatch(frogbot);
    await started.promise;
    const ttl = frogbot.adapter.setIfAbsent.mock.calls.find(
      ([, value]) => typeof value === 'string',
    )![2]!.ttl;
    await vi.advanceTimersByTimeAsync(ttl + 1);
    expect(frogbot.adapter.extendLock).toHaveBeenCalled();
    await expect(dispatch(frogbot)).rejects.toBeInstanceOf(KVLockContentionError);
    queued.resolve();
    await first;
    expect(frogbot.queue).toHaveBeenCalledTimes(1);
  });

  it('does not let a stale enqueue delete or mark a successor claim', async () => {
    vi.useFakeTimers();
    const frogbot = runtime();
    const started = Promise.withResolvers<void>();
    const queued = Promise.withResolvers<void>();
    frogbot.queue.mockImplementationOnce(() => {
      started.resolve();
      return queued.promise;
    });
    const first = dispatch(frogbot);
    const rejected = first.catch((error: unknown) => error);
    await started.promise;
    const [key, , options] = frogbot.adapter.setIfAbsent.mock.calls.find(
      ([, value]) => typeof value === 'string',
    )!;
    await frogbot.adapter.set(key, 'successor', { ttl: options!.ttl });
    await vi.advanceTimersByTimeAsync(options!.ttl / 3 + 1);
    expect(await rejected).toBeInstanceOf(KVLeaseLostError);
    queued.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(await frogbot.kv.get(key)).toBe('successor');
    expect(frogbot.adapter.setIfAbsent.mock.calls.filter(([, value]) => value === true)).toEqual(
      [],
    );
    expect(frogbot.adapter.delete).not.toHaveBeenCalled();
  });

  it('does not acknowledge delivery when dedupe persistence fails', async () => {
    const frogbot = runtime();
    const setIfAbsent = frogbot.kv.setIfAbsent;
    vi.spyOn(frogbot.kv, 'setIfAbsent')
      .mockImplementationOnce(async () => {
        throw new Error('database down');
      })
      .mockImplementation(setIfAbsent);
    await expect(dispatch(frogbot)).rejects.toThrow('database down');
    expect(frogbot.adapter.setIfAbsent.mock.calls.filter(([, value]) => value === true)).toEqual(
      [],
    );
  });
});

import assert from 'node:assert/strict';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  KVLeaseLostError,
  KVLockContentionError,
} from '../../../../packages/frogbot/src/kv/errors.js';
import { runKVLock } from '../../../../packages/frogbot/src/kv/lock.js';
import type { KVLock } from '../../../../packages/frogbot/src/kv/types.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const lock: KVLock = { key: 'job', token: 'owner' };

function createKV() {
  return {
    acquireLock: vi
      .fn<(key: string, ttl: number) => Promise<KVLock | null>>()
      .mockResolvedValue(lock),
    extendLock: vi.fn<(lock: KVLock, ttl: number) => Promise<boolean>>().mockResolvedValue(true),
    releaseLock: vi.fn<(lock: KVLock) => Promise<boolean>>().mockResolvedValue(true),
  };
}

describe('runKVLock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    assert.equal(vi.getTimerCount(), 0);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('fails promptly on contention without invoking the callback', async () => {
    const kv = createKV();
    kv.acquireLock.mockResolvedValue(null);
    const fn = vi.fn();

    await expect(runKVLock({ kv, key: 'job', ttl: 300, fn })).rejects.toBeInstanceOf(
      KVLockContentionError,
    );
    expect(fn).not.toHaveBeenCalled();
    expect(kv.extendLock).not.toHaveBeenCalled();
    expect(kv.releaseLock).not.toHaveBeenCalled();
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid ttl %s before acquiring',
    async (ttl) => {
      const kv = createKV();
      await expect(runKVLock({ kv, key: 'job', ttl, fn: vi.fn() })).rejects.toBeInstanceOf(
        RangeError,
      );
      expect(kv.acquireLock).not.toHaveBeenCalled();
    },
  );

  it('propagates acquisition failures', async () => {
    const kv = createKV();
    const error = new Error('acquire failed');
    kv.acquireLock.mockRejectedValue(error);

    await expect(runKVLock({ kv, key: 'job', ttl: 300, fn: vi.fn() })).rejects.toBe(error);
    expect(kv.releaseLock).not.toHaveBeenCalled();
  });

  it('returns synchronous results and releases the acquired ownership token', async () => {
    const kv = createKV();
    const result = await runKVLock({
      kv,
      key: 'job',
      ttl: 300,
      fn: ({ signal }) => {
        expect(signal.aborted).toBe(false);
        return 42;
      },
    });

    expect(result).toBe(42);
    expect(kv.acquireLock).toHaveBeenCalledWith('job', 300);
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
    expect(kv.extendLock).not.toHaveBeenCalled();
  });

  it('renews at ttl / 3 until the callback resolves', async () => {
    const kv = createKV();
    const callback = deferred<string>();
    const result = runKVLock({ kv, key: 'job', ttl: 300, fn: () => callback.promise });

    await vi.advanceTimersByTimeAsync(99);
    expect(kv.extendLock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(201);
    expect(kv.extendLock).toHaveBeenCalledTimes(3);
    expect(kv.extendLock).toHaveBeenLastCalledWith(lock, 300);
    callback.resolve('done');
    await expect(result).resolves.toBe('done');
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
  });

  it('serializes delayed renewals and schedules from their completion', async () => {
    const kv = createKV();
    const callback = deferred<void>();
    const renewal = deferred<boolean>();
    kv.extendLock.mockReturnValueOnce(renewal.promise);
    const result = runKVLock({ kv, key: 'job', ttl: 300, fn: () => callback.promise });

    await vi.advanceTimersByTimeAsync(250);
    expect(kv.extendLock).toHaveBeenCalledTimes(1);
    renewal.resolve(true);
    await vi.advanceTimersByTimeAsync(99);
    expect(kv.extendLock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(kv.extendLock).toHaveBeenCalledTimes(2);
    callback.resolve();
    await expect(result).resolves.toBeUndefined();
  });

  it('waits for an in-flight renewal before release without rearming a timer', async () => {
    const kv = createKV();
    const callback = deferred<void>();
    const renewal = deferred<boolean>();
    kv.extendLock.mockReturnValueOnce(renewal.promise);
    const result = runKVLock({ kv, key: 'job', ttl: 300, fn: () => callback.promise });

    await vi.advanceTimersByTimeAsync(100);
    callback.resolve();
    await vi.advanceTimersByTimeAsync(100);
    expect(kv.releaseLock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    renewal.resolve(true);
    await result;
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
    await vi.advanceTimersByTimeAsync(1000);
    expect(kv.extendLock).toHaveBeenCalledTimes(1);
  });

  it('loses the scope at ttl even when renewal hangs and a successor later acquires', async () => {
    const kv = createKV();
    const renewal = deferred<boolean>();
    let current: KVLock | undefined;
    let expiresAt = 0;
    kv.acquireLock.mockImplementation(async (key, ttl) => {
      if (current && performance.now() < expiresAt) return null;
      current = { key, token: current ? 'successor' : 'owner' };
      expiresAt = performance.now() + ttl;
      return current;
    });
    kv.extendLock.mockReturnValue(renewal.promise);
    kv.releaseLock.mockImplementation(async (held) => {
      if (held.token !== current?.token || performance.now() >= expiresAt) return false;
      current = undefined;
      return true;
    });
    let signal!: AbortSignal;
    const result = runKVLock({
      kv,
      key: 'job',
      ttl: 90,
      fn: (args) => {
        signal = args.signal;
        return new Promise<never>(() => {});
      },
    });
    const assertion = await expect(result).rejects.toBeInstanceOf(KVLeaseLostError);

    await vi.advanceTimersByTimeAsync(89);
    expect(signal.aborted).toBe(false);
    expect(kv.extendLock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(KVLeaseLostError);
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
    await vi.advanceTimersByTimeAsync(180);
    expect(await kv.acquireLock('job', 90)).toEqual({ key: 'job', token: 'successor' });

    renewal.resolve(true);
    await vi.advanceTimersByTimeAsync(270);
    expect(kv.extendLock).toHaveBeenCalledTimes(1);
    expect(kv.releaseLock).toHaveBeenCalledTimes(1);
    expect(current?.token).toBe('successor');
    expect(signal.aborted).toBe(true);
  });

  it('uses renewal request start, not response time, for the next deadline', async () => {
    const kv = createKV();
    const renewal = deferred<boolean>();
    kv.extendLock.mockReturnValueOnce(renewal.promise).mockReturnValue(new Promise(() => {}));
    const result = runKVLock({
      kv,
      key: 'job',
      ttl: 90,
      fn: () => new Promise<never>(() => {}),
    });
    const assertion = await expect(result).rejects.toBeInstanceOf(KVLeaseLostError);

    await vi.advanceTimersByTimeAsync(80);
    renewal.resolve(true);
    await vi.advanceTimersByTimeAsync(39);
    expect(kv.extendLock).toHaveBeenCalledTimes(2);
    expect(kv.releaseLock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(performance.now()).toBe(120);
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
  });

  it.each(['resolve', 'reject'] as const)(
    'bounds cleanup when renewal hangs after callback %s',
    async (completion) => {
      const kv = createKV();
      const callback = deferred<void>();
      const callbackError = new Error('callback failed');
      kv.extendLock.mockReturnValue(new Promise(() => {}));
      kv.releaseLock.mockReturnValue(new Promise(() => {}));
      const result = runKVLock({ kv, key: 'job', ttl: 90, fn: () => callback.promise });
      const assertion =
        completion === 'resolve'
          ? await expect(result).rejects.toBeInstanceOf(KVLeaseLostError)
          : await expect(result).rejects.toMatchObject({
              errors: [callbackError, expect.any(KVLeaseLostError)],
            });

      await vi.advanceTimersByTimeAsync(30);
      if (completion === 'resolve') callback.resolve();
      else callback.reject(callbackError);
      await vi.advanceTimersByTimeAsync(59);
      expect(kv.releaseLock).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await assertion;
      expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
    },
  );

  it('keeps the watchdog active during a hanging release', async () => {
    const kv = createKV();
    const release = deferred<boolean>();
    kv.releaseLock.mockReturnValue(release.promise);
    let signal!: AbortSignal;
    const result = runKVLock({
      kv,
      key: 'job',
      ttl: 90,
      fn: (args) => {
        signal = args.signal;
        return 'done';
      },
    });
    const assertion = await expect(result).rejects.toBeInstanceOf(KVLeaseLostError);

    await vi.advanceTimersByTimeAsync(89);
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(signal.aborted).toBe(true);
    release.resolve(true);
    await vi.advanceTimersByTimeAsync(90);
    await expect(result).rejects.toBe(signal.reason);
    expect(kv.extendLock).not.toHaveBeenCalled();
  });

  it.each(['false', 'error'] as const)(
    'detaches a hanging release immediately on known renewal %s',
    async (failure) => {
      const kv = createKV();
      const error = new Error('renewal failed');
      if (failure === 'false') kv.extendLock.mockResolvedValue(false);
      else kv.extendLock.mockRejectedValue(error);
      kv.releaseLock.mockReturnValue(new Promise(() => {}));
      const result = runKVLock({
        kv,
        key: 'job',
        ttl: 90,
        fn: () => new Promise<never>(() => {}),
      });
      const assertion =
        failure === 'false'
          ? await expect(result).rejects.toBeInstanceOf(KVLeaseLostError)
          : await expect(result).rejects.toBe(error);

      await vi.advanceTimersByTimeAsync(30);
      await assertion;
      expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
      expect(performance.now()).toBe(30);
    },
  );

  it('rejects a hanging acquisition and releases an overdue response without invoking the callback', async () => {
    const kv = createKV();
    const acquisition = deferred<KVLock | null>();
    kv.acquireLock.mockReturnValue(acquisition.promise);
    const fn = vi.fn();
    const result = runKVLock({ kv, key: 'job', ttl: 90, fn });
    const assertion = await expect(result).rejects.toBeInstanceOf(KVLeaseLostError);

    await vi.advanceTimersByTimeAsync(90);
    await assertion;
    expect(fn).not.toHaveBeenCalled();
    expect(kv.releaseLock).not.toHaveBeenCalled();
    acquisition.resolve(lock);
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).not.toHaveBeenCalled();
    expect(kv.extendLock).not.toHaveBeenCalled();
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
  });

  it('uses acquisition request start for the first deadline', async () => {
    const kv = createKV();
    const acquisition = deferred<KVLock | null>();
    kv.acquireLock.mockReturnValue(acquisition.promise);
    const fn = vi.fn(() => new Promise<never>(() => {}));
    const result = runKVLock({ kv, key: 'job', ttl: 90, fn });
    const assertion = await expect(result).rejects.toBeInstanceOf(KVLeaseLostError);

    await vi.advanceTimersByTimeAsync(80);
    acquisition.resolve(lock);
    await vi.advanceTimersByTimeAsync(9);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(kv.releaseLock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(kv.extendLock).not.toHaveBeenCalled();
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
  });

  it('rejects an overdue acquisition continuation before timers can run', async () => {
    const kv = createKV();
    const acquisition = deferred<KVLock | null>();
    kv.acquireLock.mockReturnValue(acquisition.promise);
    const fn = vi.fn();
    const result = runKVLock({ kv, key: 'job', ttl: 90, fn });
    vi.spyOn(performance, 'now').mockReturnValue(90);
    acquisition.resolve(lock);

    await expect(result).rejects.toBeInstanceOf(KVLeaseLostError);
    expect(fn).not.toHaveBeenCalled();
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
  });

  it('rechecks the deadline between processing acquisition and invoking the callback', async () => {
    const kv = createKV();
    const acquisition = deferred<KVLock | null>();
    kv.acquireLock.mockReturnValue(acquisition.promise);
    const fn = vi.fn();
    const result = runKVLock({ kv, key: 'job', ttl: 90, fn });
    void acquisition.promise.then(() => {
      queueMicrotask(() => vi.spyOn(performance, 'now').mockReturnValue(90));
    });
    acquisition.resolve(lock);

    await expect(result).rejects.toBeInstanceOf(KVLeaseLostError);
    expect(fn).not.toHaveBeenCalled();
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
  });

  it('does not issue a renewal when its timer runs past the deadline', async () => {
    const kv = createKV();
    const result = runKVLock({
      kv,
      key: 'job',
      ttl: 90,
      fn: () => new Promise<never>(() => {}),
    });
    const assertion = await expect(result).rejects.toBeInstanceOf(KVLeaseLostError);

    await vi.advanceTimersByTimeAsync(0);
    vi.spyOn(performance, 'now').mockReturnValue(90);
    await vi.advanceTimersByTimeAsync(30);
    await assertion;
    expect(kv.extendLock).not.toHaveBeenCalled();
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
  });

  it('rejects an overdue renewal continuation even when it reports success before timers run', async () => {
    const kv = createKV();
    const renewal = deferred<boolean>();
    kv.extendLock.mockReturnValue(renewal.promise);
    let signal!: AbortSignal;
    const result = runKVLock({
      kv,
      key: 'job',
      ttl: 90,
      fn: (args) => {
        signal = args.signal;
        return new Promise<never>(() => {});
      },
    });
    const assertion = await expect(result).rejects.toBeInstanceOf(KVLeaseLostError);

    await vi.advanceTimersByTimeAsync(30);
    vi.spyOn(performance, 'now').mockReturnValue(90);
    renewal.resolve(true);
    await assertion;
    expect(signal.aborted).toBe(true);
    expect(kv.extendLock).toHaveBeenCalledTimes(1);
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
  });

  it.each(['resolve', 'reject'] as const)(
    'checks the deadline after a synchronous callback %s without relying on timers',
    async (completion) => {
      const kv = createKV();
      const error = new Error('callback failed');
      let signal!: AbortSignal;
      const result = runKVLock({
        kv,
        key: 'job',
        ttl: 90,
        fn: (args) => {
          signal = args.signal;
          vi.spyOn(performance, 'now').mockReturnValue(90);
          if (completion === 'reject') throw error;
          return 'too late';
        },
      });

      if (completion === 'resolve') await expect(result).rejects.toBeInstanceOf(KVLeaseLostError);
      else {
        await expect(result).rejects.toMatchObject({
          errors: [error, expect.any(KVLeaseLostError)],
        });
      }
      expect(signal.aborted).toBe(true);
      expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
    },
  );

  it('checks the deadline on release completion before returning callback success', async () => {
    const kv = createKV();
    kv.releaseLock.mockImplementation(async () => {
      vi.spyOn(performance, 'now').mockReturnValue(90);
      return true;
    });

    await expect(runKVLock({ kv, key: 'job', ttl: 90, fn: () => 'done' })).rejects.toBeInstanceOf(
      KVLeaseLostError,
    );
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
  });

  it('ignores wall-clock changes while enforcing the monotonic deadline', async () => {
    const kv = createKV();
    kv.extendLock.mockReturnValue(new Promise(() => {}));
    const result = runKVLock({
      kv,
      key: 'job',
      ttl: 90,
      fn: () => new Promise<never>(() => {}),
    });
    const assertion = await expect(result).rejects.toBeInstanceOf(KVLeaseLostError);

    await vi.advanceTimersByTimeAsync(30);
    vi.setSystemTime(new Date('2000-01-01'));
    await vi.advanceTimersByTimeAsync(59);
    expect(kv.releaseLock).not.toHaveBeenCalled();
    vi.setSystemTime(new Date('2100-01-01'));
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(performance.now()).toBe(90);
  });

  it('handles detached renewal and release rejections after deadline loss', async () => {
    const kv = createKV();
    const renewal = deferred<boolean>();
    const release = deferred<boolean>();
    kv.extendLock.mockReturnValue(renewal.promise);
    kv.releaseLock.mockReturnValue(release.promise);
    const result = runKVLock({
      kv,
      key: 'job',
      ttl: 90,
      fn: () => new Promise<never>(() => {}),
    });
    const assertion = await expect(result).rejects.toBeInstanceOf(KVLeaseLostError);

    await vi.advanceTimersByTimeAsync(90);
    await assertion;
    renewal.reject(new Error('late renewal failure'));
    release.reject(new Error('late release failure'));
    await vi.advanceTimersByTimeAsync(90);
    await expect(result).rejects.toBeInstanceOf(KVLeaseLostError);
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
  });

  it('retains a known overdue renewal failure while detaching hung release', async () => {
    const kv = createKV();
    const renewal = deferred<boolean>();
    const error = new Error('renewal failed');
    kv.extendLock.mockReturnValue(renewal.promise);
    kv.releaseLock.mockReturnValue(new Promise(() => {}));
    const result = runKVLock({
      kv,
      key: 'job',
      ttl: 90,
      fn: () => new Promise<never>(() => {}),
    });
    const assertion = await expect(result).rejects.toMatchObject({
      errors: [error, expect.any(KVLeaseLostError)],
    });

    await vi.advanceTimersByTimeAsync(30);
    vi.spyOn(performance, 'now').mockReturnValue(90);
    renewal.reject(error);
    await assertion;
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
  });

  it('retains cancellation and release errors already observed during watchdog loss', async () => {
    const kv = createKV();
    const callbackError = new Error('cancellation failed');
    const releaseError = new Error('release failed');
    kv.extendLock.mockReturnValue(new Promise(() => {}));
    kv.releaseLock.mockRejectedValue(releaseError);
    const result = runKVLock({
      kv,
      key: 'job',
      ttl: 90,
      fn: ({ signal }) =>
        new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => reject(callbackError), { once: true });
        }),
    });
    const assertion = await expect(result).rejects.toMatchObject({
      errors: [expect.any(KVLeaseLostError), callbackError, releaseError],
    });

    await vi.advanceTimersByTimeAsync(90);
    await assertion;
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
  });

  it.each(['reject', 'release rejection'] as const)(
    'handles a detached acquisition %s after deadline loss',
    async (completion) => {
      const kv = createKV();
      const acquisition = deferred<KVLock | null>();
      kv.acquireLock.mockReturnValue(acquisition.promise);
      kv.releaseLock.mockRejectedValue(new Error('late release failure'));
      const fn = vi.fn();
      const result = runKVLock({ kv, key: 'job', ttl: 90, fn });
      const assertion = await expect(result).rejects.toBeInstanceOf(KVLeaseLostError);

      await vi.advanceTimersByTimeAsync(90);
      await assertion;
      if (completion === 'reject') acquisition.reject(new Error('late acquisition failure'));
      else acquisition.resolve(lock);
      await vi.advanceTimersByTimeAsync(90);
      expect(fn).not.toHaveBeenCalled();
      expect(kv.extendLock).not.toHaveBeenCalled();
      if (completion === 'release rejection') {
        expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
      } else expect(kv.releaseLock).not.toHaveBeenCalled();
    },
  );

  it('aborts and rejects on lease loss even when the callback never settles', async () => {
    const kv = createKV();
    kv.extendLock.mockResolvedValue(false);
    kv.releaseLock.mockResolvedValue(false);
    let signal!: AbortSignal;
    const result = runKVLock({
      kv,
      key: 'job',
      ttl: 300,
      fn: (args) => {
        signal = args.signal;
        return new Promise<never>(() => {});
      },
    });
    const assertion = await expect(result).rejects.toBeInstanceOf(KVLeaseLostError);

    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(KVLeaseLostError);
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
  });

  it('propagates renewal backend errors and aborts a hung callback', async () => {
    const kv = createKV();
    const error = new Error('renewal backend unavailable');
    kv.extendLock.mockRejectedValue(error);
    let signal!: AbortSignal;
    const result = runKVLock({
      kv,
      key: 'job',
      ttl: 300,
      fn: (args) => {
        signal = args.signal;
        return new Promise<never>(() => {});
      },
    });
    const assertion = await expect(result).rejects.toBe(error);

    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(signal.reason).toBe(error);
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
  });

  it.each(['resolve', 'reject'] as const)(
    'retains a late renewal error when the callback completes with %s',
    async (completion) => {
      const kv = createKV();
      const callback = deferred<void>();
      const renewal = deferred<boolean>();
      const callbackError = new Error('callback failed');
      const renewalError = new Error('late renewal failed');
      kv.extendLock.mockReturnValueOnce(renewal.promise);
      const result = runKVLock({ kv, key: 'job', ttl: 300, fn: () => callback.promise });
      const assertion =
        completion === 'resolve'
          ? await expect(result).rejects.toBe(renewalError)
          : await expect(result).rejects.toMatchObject({ errors: [callbackError, renewalError] });

      await vi.advanceTimersByTimeAsync(100);
      if (completion === 'resolve') callback.resolve();
      else callback.reject(callbackError);
      await vi.advanceTimersByTimeAsync(0);
      renewal.reject(renewalError);
      await assertion;
      expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
    },
  );

  it('rejects when an in-flight renewal reports loss after callback success', async () => {
    const kv = createKV();
    const callback = deferred<void>();
    const renewal = deferred<boolean>();
    kv.extendLock.mockReturnValueOnce(renewal.promise);
    const result = runKVLock({ kv, key: 'job', ttl: 300, fn: () => callback.promise });
    const assertion = await expect(result).rejects.toBeInstanceOf(KVLeaseLostError);

    await vi.advanceTimersByTimeAsync(100);
    callback.resolve();
    await vi.advanceTimersByTimeAsync(0);
    renewal.resolve(false);
    await assertion;
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
  });

  it('preserves synchronous callback and release failures', async () => {
    const kv = createKV();
    const callbackError = new Error('callback failed');
    const releaseError = new Error('release failed');
    kv.releaseLock.mockRejectedValue(releaseError);
    const result = runKVLock({
      kv,
      key: 'job',
      ttl: 300,
      fn: () => {
        throw callbackError;
      },
    });

    await expect(result).rejects.toBeInstanceOf(AggregateError);
    await expect(result).rejects.toMatchObject({ errors: [callbackError, releaseError] });
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
  });

  it('preserves non-Error callback rejections', async () => {
    const kv = createKV();
    await expect(
      runKVLock({ kv, key: 'job', ttl: 300, fn: () => Promise.reject(undefined) }),
    ).rejects.toBeUndefined();
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
  });

  it('preserves lease loss, cancellation callback failure, and release failure', async () => {
    const kv = createKV();
    const callbackError = new Error('callback cancellation failed');
    const releaseError = new Error('release failed');
    kv.extendLock.mockResolvedValue(false);
    kv.releaseLock.mockRejectedValue(releaseError);
    const result = runKVLock({
      kv,
      key: 'job',
      ttl: 300,
      fn: ({ signal }) =>
        new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => reject(callbackError), { once: true });
        }),
    });
    const assertion = await expect(result).rejects.toMatchObject({
      errors: [expect.any(KVLeaseLostError), callbackError, releaseError],
    });

    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it('reports release backend errors after a successful callback', async () => {
    const kv = createKV();
    const error = new Error('release failed');
    kv.releaseLock.mockRejectedValue(error);
    await expect(runKVLock({ kv, key: 'job', ttl: 300, fn: () => 42 })).rejects.toBe(error);
  });

  it('reports ownership loss detected during release', async () => {
    const kv = createKV();
    kv.releaseLock.mockResolvedValue(false);
    await expect(runKVLock({ kv, key: 'job', ttl: 300, fn: () => 42 })).rejects.toBeInstanceOf(
      KVLeaseLostError,
    );
    expect(kv.releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
  });

  it('observes late callback rejection after loss without leaving timers behind', async () => {
    const kv = createKV();
    const callback = deferred<void>();
    kv.extendLock.mockResolvedValue(false);
    const result = runKVLock({ kv, key: 'job', ttl: 300, fn: () => callback.promise });
    const assertion = await expect(result).rejects.toBeInstanceOf(KVLeaseLostError);

    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    callback.reject(new Error('late callback failure'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(kv.releaseLock).toHaveBeenCalledTimes(1);
    expect(kv.extendLock).toHaveBeenCalledTimes(1);
  });

  it('does not turn a large ttl into a one-millisecond renewal loop', async () => {
    const kv = createKV();
    const callback = deferred<void>();
    const result = runKVLock({
      kv,
      key: 'job',
      ttl: 10_000_000_000,
      fn: () => callback.promise,
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(kv.extendLock).not.toHaveBeenCalled();
    callback.resolve();
    await result;
  });
});

import { KVLeaseLostError, KVLockContentionError } from './errors.js';
import type { KV, KVLock, KVLockCallback } from './types.js';
import { validateKVTTL } from './validateTTL.js';

export async function runKVLock<T>({
  kv,
  key,
  ttl,
  fn,
}: {
  kv: Pick<KV, 'acquireLock' | 'extendLock' | 'releaseLock'>;
  key: string;
  ttl: number;
  fn: KVLockCallback<T>;
}): Promise<T> {
  validateKVTTL(ttl);

  const controller = new AbortController();
  const errors: unknown[] = [];
  let stopped = false;
  let settled = false;
  let lock: KVLock | undefined;
  let deadline = performance.now() + ttl;
  let renewalTimer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let renewal: Promise<void> | undefined;
  let release: Promise<void> | undefined;
  let loseLease!: () => void;

  const lostLease = new Promise<void>((resolve) => {
    loseLease = resolve;
  });

  const recordError = (error: unknown) => {
    if (!settled && !errors.includes(error)) errors.push(error);
  };

  const failLease = (error: unknown) => {
    if (controller.signal.aborted) return;
    recordError(error);
    stopped = true;
    clearTimeout(renewalTimer);
    clearTimeout(watchdog);
    controller.abort(error);
    loseLease();
  };

  const checkDeadline = () => {
    if (!controller.signal.aborted && performance.now() >= deadline) {
      failLease(new KVLeaseLostError(key));
    }
    return !controller.signal.aborted;
  };

  const watchDeadline = () => {
    clearTimeout(watchdog);
    if (checkDeadline()) {
      watchdog = setTimeout(
        watchDeadline,
        Math.min(2_147_483_647, Math.ceil(deadline - performance.now())),
      );
    }
  };

  const releaseLock = (acquired: KVLock) => {
    release ??= (async () => {
      try {
        const released = await kv.releaseLock(acquired);
        if (checkDeadline() && !released) failLease(new KVLeaseLostError(key));
      } catch (error) {
        recordError(error);
        checkDeadline();
      }
    })();
    return release;
  };

  const schedule = () => {
    if (!stopped && checkDeadline()) {
      renewalTimer = setTimeout(
        () => {
          renewal = renew();
        },
        Math.min(2_147_483_647, Math.max(1, Math.floor(ttl / 3))),
      );
    }
  };

  const renew = async () => {
    if (stopped || !checkDeadline() || !lock) return;
    const started = performance.now();
    try {
      const extended = await kv.extendLock(lock, ttl);
      if (!checkDeadline()) return;
      if (!extended) {
        failLease(new KVLeaseLostError(key));
        return;
      }
      deadline = started + ttl;
      watchDeadline();
      schedule();
    } catch (error) {
      recordError(error);
      if (checkDeadline()) failLease(error);
    }
  };

  let value: T | undefined;
  try {
    watchDeadline();

    const acquisition = (async () => {
      try {
        lock = (await kv.acquireLock(key, ttl)) ?? undefined;
        if (!checkDeadline()) {
          if (lock) void releaseLock(lock);
          return false;
        }
        if (!lock) {
          recordError(new KVLockContentionError(key));
          return false;
        }
        return true;
      } catch (error) {
        recordError(error);
        checkDeadline();
        return false;
      }
    })();

    if ((await Promise.race([acquisition, lostLease])) && checkDeadline()) {
      schedule();

      const callback = (async () => {
        try {
          if (checkDeadline()) value = await fn({ signal: controller.signal });
        } catch (error) {
          recordError(error);
        } finally {
          checkDeadline();
        }
      })();

      await Promise.race([callback, lostLease]);
    }
  } finally {
    stopped = true;
    clearTimeout(renewalTimer);

    checkDeadline();
    if (renewal) await Promise.race([renewal, lostLease]);

    checkDeadline();
    if (lock) await Promise.race([releaseLock(lock), lostLease]);

    checkDeadline();
    clearTimeout(watchdog);
    settled = true;
  }

  if (errors.length > 1) {
    throw new AggregateError(errors, `KV lock failed: ${key}`);
  }
  if (errors.length === 1) {
    throw errors[0];
  }

  return value as T;
}

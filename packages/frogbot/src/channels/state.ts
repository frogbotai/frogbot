import { setTimeout } from 'node:timers/promises';

import type { QueueEntry, StateAdapter } from 'chat';
import type { KVStoreValue } from 'payload';

import { KVLockContentionError } from '../kv/errors.js';
import type { KV } from '../kv/types.js';

const LIST_LOCK_TTL = 30_000;

export function createChannelStateAdapter({
  kv,
  namespace,
}: {
  kv: KV;
  namespace: string;
}): StateAdapter {
  const key = (value: string) => `channels:${namespace}:${value}`;
  const listKey = (value: string) => key(`list:${value}`);
  const lockKey = (threadId: string) => key(`lock:${threadId}`);
  const subscriptionKey = (threadId: string) => key(`subscription:${threadId}`);
  const queueKey = (threadId: string) => `queue:${threadId}`;
  const mutateList = async <T>(
    value: string,
    mutate: (list: T[]) => T[],
    ttlMs?: number,
  ): Promise<T[]> => {
    for (;;) {
      try {
        return await kv.lock(key(`list-lock:${value}`), LIST_LOCK_TTL, async ({ signal }) => {
          const current = ((await kv.get(listKey(value))) as T[] | null) ?? [];

          signal.throwIfAborted();

          const next = mutate(current);

          if (next.length === 0) {
            await kv.delete(listKey(value));
          } else {
            await kv.set(listKey(value), next, ttlMs === undefined ? undefined : { ttl: ttlMs });
          }

          return next;
        });
      } catch (error) {
        if (!(error instanceof KVLockContentionError)) throw error;

        await setTimeout(100);
      }
    }
  };

  return {
    acquireLock: async (threadId, ttlMs) => {
      const expiresAt = Date.now() + ttlMs;
      const lock = await kv.acquireLock(lockKey(threadId), ttlMs);

      return lock ? { threadId, token: lock.token, expiresAt } : null;
    },
    appendToList: async (value, entry, options) => {
      await mutateList(
        value,
        (list) => {
          const next = [...list, entry];

          return options?.maxLength === undefined ? next : next.slice(-options.maxLength);
        },
        options?.ttlMs,
      );
    },
    connect: async () => {},
    delete: (value) => kv.delete(key(`value:${value}`)),
    dequeue: async (threadId) => {
      let entry: QueueEntry | null = null;

      await mutateList<QueueEntry>(queueKey(threadId), (list) => {
        entry = list[0] ?? null;

        return list.slice(1);
      });

      return entry;
    },
    disconnect: async () => {},
    enqueue: async (threadId, entry, maxSize) => {
      const next = await mutateList<QueueEntry>(queueKey(threadId), (list) =>
        [...list, entry].slice(-maxSize),
      );

      return next.length;
    },
    extendLock: (lock, ttlMs) =>
      kv.extendLock({ key: lockKey(lock.threadId), token: lock.token }, ttlMs),
    forceReleaseLock: (threadId) => kv.delete(lockKey(threadId)),
    get: async <T>(value: string) => (await kv.get(key(`value:${value}`))) as T | null,
    getList: async <T>(value: string) => ((await kv.get(listKey(value))) as T[] | null) ?? [],
    isSubscribed: (threadId) => kv.has(subscriptionKey(threadId)),
    queueDepth: async (threadId) => {
      const queue = (await kv.get(listKey(queueKey(threadId)))) as QueueEntry[] | null;

      return queue?.length ?? 0;
    },
    releaseLock: async (lock) => {
      await kv.releaseLock({ key: lockKey(lock.threadId), token: lock.token });
    },
    set: (value, entry, ttlMs) =>
      kv.set(
        key(`value:${value}`),
        entry as KVStoreValue,
        ttlMs === undefined ? undefined : { ttl: ttlMs },
      ),
    setIfNotExists: (value, entry, ttlMs) =>
      kv.setIfAbsent(
        key(`value:${value}`),
        entry as KVStoreValue,
        ttlMs === undefined ? undefined : { ttl: ttlMs },
      ),
    subscribe: async (threadId) => {
      await kv.set(subscriptionKey(threadId), true);
    },
    unsubscribe: (threadId) => kv.delete(subscriptionKey(threadId)),
  };
}

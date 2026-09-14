import type { KVStoreValue } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { createChannelStateAdapter } from '../../../../packages/frogbot/src/channels/state.js';
import { runKVLock } from '../../../../packages/frogbot/src/kv/lock.js';
import type { KV, KVLock, KVSetOptions } from '../../../../packages/frogbot/src/kv/types.js';

function memoryKV(): KV {
  const values = new Map<string, KVStoreValue>();
  const locks = new Map<string, string>();
  let token = 0;

  const kv = {
    clear: async () => values.clear(),
    delete: async (key: string) => {
      values.delete(key);
      locks.delete(key);
    },
    get: async (key: string) => values.get(key) ?? null,
    has: async (key: string) => values.has(key),
    keys: async () => [...values.keys()],
    set: async (key: string, value: KVStoreValue, _options?: KVSetOptions) => {
      values.set(key, value);
    },
    setIfAbsent: async (key: string, value: KVStoreValue, _options?: KVSetOptions) => {
      if (values.has(key)) return false;

      values.set(key, value);

      return true;
    },
    acquireLock: async (key: string) => {
      if (locks.has(key)) return null;

      const next = `token-${++token}`;

      locks.set(key, next);
      values.set(key, next);

      return { key, token: next };
    },
    extendLock: async (lock: KVLock) => locks.get(lock.key) === lock.token,
    releaseLock: async (lock: KVLock) => {
      if (locks.get(lock.key) !== lock.token) return false;

      locks.delete(lock.key);
      values.delete(lock.key);

      return true;
    },
    lock: <T>(key: string, ttl: number, fn: Parameters<typeof runKVLock<T>>[0]['fn']) =>
      runKVLock({ kv, key, ttl, fn }),
  };

  return kv as KV;
}

describe('createChannelStateAdapter', () => {
  it('shares namespaced values and subscriptions across replicas', async () => {
    const kv = memoryKV();
    const first = createChannelStateAdapter({ kv, namespace: 'slack:workspace-1' });
    const second = createChannelStateAdapter({ kv, namespace: 'slack:workspace-1' });

    await first.set('delivery', { id: 1 });
    await first.subscribe('thread-1');

    await expect(second.get('delivery')).resolves.toEqual({ id: 1 });
    await expect(second.isSubscribed('thread-1')).resolves.toBe(true);
  });

  it('keeps channel instances isolated', async () => {
    const kv = memoryKV();
    const first = createChannelStateAdapter({ kv, namespace: 'slack:workspace-1' });
    const second = createChannelStateAdapter({ kv, namespace: 'slack:workspace-2' });

    await first.set('delivery', true);

    await expect(second.get('delivery')).resolves.toBeNull();
  });

  it('enforces token ownership for lock renewal and release', async () => {
    const kv = memoryKV();
    const state = createChannelStateAdapter({ kv, namespace: 'slack:workspace-1' });
    const lock = await state.acquireLock('thread-1', 10_000);

    expect(lock).not.toBeNull();
    await expect(state.acquireLock('thread-1', 10_000)).resolves.toBeNull();
    await expect(state.extendLock({ ...lock!, token: 'wrong' }, 10_000)).resolves.toBe(false);

    await state.releaseLock({ ...lock!, token: 'wrong' });

    await expect(state.acquireLock('thread-1', 10_000)).resolves.toBeNull();

    await state.releaseLock(lock!);

    await expect(state.acquireLock('thread-1', 10_000)).resolves.not.toBeNull();
  });

  it('supports bounded lists and queues', async () => {
    const state = createChannelStateAdapter({
      kv: memoryKV(),
      namespace: 'slack:workspace-1',
    });

    await state.appendToList('history', 1, { maxLength: 2 });
    await state.appendToList('history', 2, { maxLength: 2 });
    await state.appendToList('history', 3, { maxLength: 2 });

    await expect(state.getList('history')).resolves.toEqual([2, 3]);

    const first = { enqueuedAt: 1, expiresAt: 10, message: {} as never };
    const second = { enqueuedAt: 2, expiresAt: 10, message: {} as never };

    await expect(state.enqueue('thread-1', first, 1)).resolves.toBe(1);
    await expect(state.enqueue('thread-1', second, 1)).resolves.toBe(1);
    await expect(state.dequeue('thread-1')).resolves.toBe(second);
    await expect(state.queueDepth('thread-1')).resolves.toBe(0);
  });

  it('does not add acquisition latency to the reported lock expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    try {
      const kv = memoryKV();
      const acquire = kv.acquireLock;

      kv.acquireLock = async (key, ttl) => {
        const lock = await acquire(key, ttl);

        vi.setSystemTime(1500);

        return lock;
      };

      const state = createChannelStateAdapter({ kv, namespace: 'latency' });

      await expect(state.acquireLock('thread', 1000)).resolves.toMatchObject({ expiresAt: 2000 });
    } finally {
      vi.useRealTimers();
    }
  });
});

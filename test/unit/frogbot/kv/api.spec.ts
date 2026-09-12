import type { KVAdapter, KVStoreValue } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import {
  createKV,
  kvAtomic,
  KVLockContentionError,
  KVUnsupportedError,
} from '../../../../packages/frogbot/src/exports/kv.js';
import type { KV, KVAtomicAdapter, KVLock } from '../../../../packages/frogbot/src/kv/types.js';

class LegacyAdapter implements KVAdapter {
  readonly values = new Map<string, KVStoreValue>();

  async clear() {
    this.values.clear();
  }

  async delete(key: string) {
    this.values.delete(key);
  }

  async get<T extends KVStoreValue>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async has(key: string) {
    return this.values.has(key);
  }

  async keys() {
    return [...this.values.keys()];
  }

  async set(key: string, value: KVStoreValue) {
    this.values.set(key, value);
  }
}

class AtomicAdapter extends LegacyAdapter implements KVAtomicAdapter {
  readonly [kvAtomic] = true;

  async setIfAbsent(key: string, value: KVStoreValue) {
    if (this.values.has(key)) return false;
    this.values.set(key, value);
    return true;
  }

  async extendLock(lock: KVLock) {
    return this.values.get(lock.key) === lock.token;
  }

  async releaseLock(lock: KVLock) {
    if (this.values.get(lock.key) !== lock.token) return false;
    this.values.delete(lock.key);
    return true;
  }
}

const lock: KVLock = { key: 'existing', token: 'owner' };
const ttlOperations: Array<{ name: string; run: (kv: KV, ttl: number) => Promise<unknown> }> = [
  { name: 'set', run: (kv, ttl) => kv.set(lock.key, 'replacement', { ttl }) },
  { name: 'setIfAbsent', run: (kv, ttl) => kv.setIfAbsent(lock.key, 'replacement', { ttl }) },
  { name: 'acquireLock', run: (kv, ttl) => kv.acquireLock(lock.key, ttl) },
  { name: 'extendLock', run: (kv, ttl) => kv.extendLock(lock, ttl) },
  { name: 'lock', run: (kv, ttl) => kv.lock(lock.key, ttl, () => 'result') },
];

describe('createKV', () => {
  it('retains ordinary third-party methods and their receiver when facade methods are detached', async () => {
    const adapter = new LegacyAdapter();
    const setSpy = vi.spyOn(adapter, 'set');
    const { clear, delete: deleteKey, get, has, keys, set } = createKV({ adapter });

    await set('first', { nested: [0, false, ''] });
    await set('second', false, {});
    await set('third', 0, { ttl: undefined });
    await expect(get('first')).resolves.toEqual({ nested: [0, false, ''] });
    await expect(get('second')).resolves.toBe(false);
    await expect(get('third')).resolves.toBe(0);
    await expect(get('missing')).resolves.toBeNull();
    await expect(has('first')).resolves.toBe(true);
    await expect(keys()).resolves.toEqual(['first', 'second', 'third']);
    expect(setSpy.mock.calls).toEqual([
      ['first', { nested: [0, false, ''] }],
      ['second', false],
      ['third', 0],
    ]);
    await deleteKey('first');
    await expect(has('first')).resolves.toBe(false);
    await clear();
    await expect(keys()).resolves.toEqual([]);
    expect(adapter.values.size).toBe(0);
  });

  it.each([
    ...ttlOperations.map(({ name, run }) => ({ name, run: (kv: KV) => run(kv, 1000) })),
    { name: 'setIfAbsent without ttl', run: (kv: KV) => kv.setIfAbsent(lock.key, 'replacement') },
    { name: 'releaseLock', run: (kv: KV) => kv.releaseLock(lock) },
  ])('rejects unsupported $name without touching an existing value', async ({ run }) => {
    const adapter = new LegacyAdapter();
    adapter.values.set(lock.key, lock.token);
    const spies = ['clear', 'delete', 'get', 'has', 'keys', 'set'].map((method) =>
      vi.spyOn(adapter, method as keyof KVAdapter),
    );

    await expect(run(createKV({ adapter }))).rejects.toBeInstanceOf(KVUnsupportedError);
    expect([...adapter.values]).toEqual([[lock.key, lock.token]]);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it.each([undefined, false, 1, 'true'])(
    'requires an explicit true capability marker, got %s',
    async (marker) => {
      const adapter = new AtomicAdapter();
      Object.defineProperty(adapter, kvAtomic, { value: marker });
      const set = vi.spyOn(adapter, 'set');
      const setIfAbsent = vi.spyOn(adapter, 'setIfAbsent');
      const kv = createKV({ adapter });

      await expect(kv.set('key', 'value', { ttl: 1 })).rejects.toBeInstanceOf(KVUnsupportedError);
      await expect(kv.setIfAbsent('key', 'value')).rejects.toBeInstanceOf(KVUnsupportedError);
      expect(set).not.toHaveBeenCalled();
      expect(setIfAbsent).not.toHaveBeenCalled();
      expect(kvAtomic).toBe(Symbol.for('frogbot.kv.atomic'));
    },
  );

  describe.each(ttlOperations)('$name ttl validation', ({ run }) => {
    it.each([
      0,
      -0,
      -1,
      0.5,
      NaN,
      Infinity,
      -Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      Number.MAX_VALUE,
      '1000',
      null,
      true,
    ])('rejects %s before invoking adapter methods', async (ttl) => {
      const adapter = new AtomicAdapter();
      adapter.values.set(lock.key, lock.token);
      const spies = ['set', 'setIfAbsent', 'extendLock', 'releaseLock'].map((method) =>
        vi.spyOn(adapter, method as 'set' | 'setIfAbsent' | 'extendLock' | 'releaseLock'),
      );

      await expect(run(createKV({ adapter }), ttl as number)).rejects.toBeInstanceOf(RangeError);
      expect([...adapter.values]).toEqual([[lock.key, lock.token]]);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    });
  });

  it.each([1, 1000, Number.MAX_SAFE_INTEGER])(
    'forwards valid ttl %s and preserves atomic method receivers',
    async (ttl) => {
      const adapter = new AtomicAdapter();
      const set = vi.spyOn(adapter, 'set');
      const setIfAbsent = vi.spyOn(adapter, 'setIfAbsent');
      const extendLock = vi.spyOn(adapter, 'extendLock');
      const releaseLock = vi.spyOn(adapter, 'releaseLock');
      const kv = createKV({ adapter });
      const options = { ttl };

      await kv.set('value', { count: 1 }, options);
      expect(set).toHaveBeenCalledExactlyOnceWith('value', { count: 1 }, options);
      await expect(kv.setIfAbsent(lock.key, lock.token, options)).resolves.toBe(true);
      await expect(kv.setIfAbsent(lock.key, 'replacement')).resolves.toBe(false);
      expect(setIfAbsent.mock.calls).toEqual([
        [lock.key, lock.token, options],
        [lock.key, 'replacement', undefined],
      ]);
      await expect(kv.extendLock(lock, ttl)).resolves.toBe(true);
      expect(extendLock).toHaveBeenCalledExactlyOnceWith(lock, ttl);
      await expect(kv.releaseLock(lock)).resolves.toBe(true);
      expect(releaseLock).toHaveBeenCalledExactlyOnceWith(lock);
      for (const spy of [set, setIfAbsent, extendLock, releaseLock]) {
        expect(spy.mock.contexts.every((receiver) => receiver === adapter)).toBe(true);
      }
    },
  );

  it('returns null on lock contention without replacing the current owner', async () => {
    const adapter = new AtomicAdapter();
    adapter.values.set(lock.key, lock.token);
    const kv = createKV({ adapter });
    const callback = vi.fn();

    await expect(kv.acquireLock(lock.key, 1000)).resolves.toBeNull();
    await expect(kv.lock(lock.key, 1000, callback)).rejects.toBeInstanceOf(KVLockContentionError);
    expect(callback).not.toHaveBeenCalled();
    expect(adapter.values.get(lock.key)).toBe(lock.token);
  });

  it('issues unique opaque ownership tokens across acquisitions and facade instances', async () => {
    const adapter = new AtomicAdapter();
    const setIfAbsent = vi.spyOn(adapter, 'setIfAbsent');
    const clients = [createKV({ adapter }), createKV({ adapter })];
    const tokens = new Set<string>();

    for (let index = 0; index < 32; index++) {
      const kv = clients[index % clients.length];
      const acquired = await kv.acquireLock(lock.key, 1000);
      expect(acquired).toEqual({ key: lock.key, token: expect.any(String) });
      if (!acquired) throw new Error('Expected an acquired lock');
      expect(acquired.token.length).toBeGreaterThan(0);
      expect(acquired.token).not.toBe(lock.key);
      expect(tokens.has(acquired.token)).toBe(false);
      expect(setIfAbsent).toHaveBeenLastCalledWith(lock.key, acquired.token, { ttl: 1000 });
      tokens.add(acquired.token);
      await expect(kv.releaseLock(acquired)).resolves.toBe(true);
    }
    expect(tokens.size).toBe(32);
  });

  it('runs a lock callback with an abort signal and releases its token', async () => {
    const adapter = new AtomicAdapter();
    const releaseLock = vi.spyOn(adapter, 'releaseLock');
    const kv = createKV({ adapter });

    await expect(
      kv.lock('job', 1000, ({ signal }) => {
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal.aborted).toBe(false);
        expect(adapter.values.has('job')).toBe(true);
        return { completed: true };
      }),
    ).resolves.toEqual({ completed: true });
    expect(releaseLock).toHaveBeenCalledExactlyOnceWith({ key: 'job', token: expect.any(String) });
    expect(adapter.values.has('job')).toBe(false);
  });

  it('propagates adapter failures unchanged', async () => {
    const adapter = new AtomicAdapter();
    const error = new Error('storage unavailable');
    vi.spyOn(adapter, 'set').mockRejectedValue(error);
    vi.spyOn(adapter, 'setIfAbsent').mockRejectedValue(error);
    const kv = createKV({ adapter });

    await expect(kv.set('key', 'value')).rejects.toBe(error);
    await expect(kv.set('key', 'value', { ttl: 1000 })).rejects.toBe(error);
    await expect(kv.setIfAbsent('key', 'value')).rejects.toBe(error);
    await expect(kv.acquireLock('key', 1000)).rejects.toBe(error);
  });
});

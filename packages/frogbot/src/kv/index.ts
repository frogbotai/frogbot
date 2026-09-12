import { randomUUID } from 'node:crypto';

import type { KVAdapter } from 'payload';

import { KVUnsupportedError } from './errors.js';
import { runKVLock } from './lock.js';
import type { KV, KVAtomicAdapter } from './types.js';
import { kvAtomic } from './types.js';
import { validateKVTTL } from './validateTTL.js';

export function createKV({ adapter }: { adapter: KVAdapter }): KV {
  const atomic = (): KVAtomicAdapter => {
    if (!(kvAtomic in adapter) || adapter[kvAtomic] !== true) throw new KVUnsupportedError();
    return adapter as KVAtomicAdapter;
  };
  const kv: KV = {
    clear: () => adapter.clear(),
    delete: (key) => adapter.delete(key),
    get: (key) => adapter.get(key),
    has: (key) => adapter.has(key),
    keys: () => adapter.keys(),
    async set(key, value, options) {
      if (options?.ttl === undefined) return adapter.set(key, value);
      validateKVTTL(options.ttl);
      await atomic().set(key, value, options);
    },
    async setIfAbsent(key, value, options) {
      if (options?.ttl !== undefined) validateKVTTL(options.ttl);
      return atomic().setIfAbsent(key, value, options);
    },
    async acquireLock(key, ttl) {
      validateKVTTL(ttl);
      const token = randomUUID();
      return (await atomic().setIfAbsent(key, token, { ttl })) ? { key, token } : null;
    },
    async extendLock(lock, ttl) {
      validateKVTTL(ttl);
      return atomic().extendLock(lock, ttl);
    },
    async releaseLock(lock) {
      return atomic().releaseLock(lock);
    },
    lock: (key, ttl, fn) => runKVLock({ kv, key, ttl, fn }),
  };
  return kv;
}

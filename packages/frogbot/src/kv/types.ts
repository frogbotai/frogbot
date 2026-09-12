import type { KVAdapter, KVStoreValue } from 'payload';

export const kvAtomic = Symbol.for('frogbot.kv.atomic');

export type KVSetOptions = { ttl?: number };

export type KVLock = { readonly key: string; readonly token: string };

export type KVLockCallback<T> = (args: { signal: AbortSignal }) => Promise<T> | T;

export interface KVAtomicAdapter extends KVAdapter {
  readonly [kvAtomic]: true;
  set(key: string, value: KVStoreValue, options?: KVSetOptions): Promise<void>;
  setIfAbsent(key: string, value: KVStoreValue, options?: KVSetOptions): Promise<boolean>;
  extendLock(lock: KVLock, ttl: number): Promise<boolean>;
  releaseLock(lock: KVLock): Promise<boolean>;
}

export interface KVDatabaseAdapter extends KVAtomicAdapter {
  cleanup(): Promise<void>;
}

export interface KV extends Omit<KVAtomicAdapter, typeof kvAtomic> {
  acquireLock(key: string, ttl: number): Promise<KVLock | null>;
  lock<T>(key: string, ttl: number, fn: KVLockCallback<T>): Promise<T>;
}

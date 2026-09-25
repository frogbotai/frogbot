import type { KVAdapter, KVAdapterResult, KVStoreValue } from 'payload';
import { expectTypeOf } from 'vitest';

import type {
  createKV,
  databaseKVAdapter,
  DatabaseKVAdapterOptions,
  KV,
  KVAtomicAdapter,
  KVDatabaseAdapter,
  KVLock,
  KVLockCallback,
  KVSetOptions,
} from '../exports/kv.js';
import type { kvAtomic } from '../exports/kv.js';
import type { FrogBot } from '../frogbot.js';
import type { databaseKVAdapter as rootDatabaseKVAdapter } from '../index.js';

expectTypeOf<typeof createKV>().parameters.toEqualTypeOf<[{ adapter: KVAdapter }]>();
expectTypeOf<typeof createKV>().returns.toEqualTypeOf<KV>();
expectTypeOf<FrogBot['kv']>().toEqualTypeOf<KV>();
expectTypeOf<KV>().toMatchTypeOf<KVAdapter>();
expectTypeOf<KVAtomicAdapter>().toMatchTypeOf<KVAdapter>();
expectTypeOf<KVAdapter>().not.toMatchTypeOf<KVAtomicAdapter>();
expectTypeOf<KVAtomicAdapter[typeof kvAtomic]>().toEqualTypeOf<true>();
expectTypeOf<typeof kvAtomic>().not.toMatchTypeOf<keyof KV>();
expectTypeOf<KVDatabaseAdapter>().toMatchTypeOf<KVAtomicAdapter>();
expectTypeOf<KVDatabaseAdapter['cleanup']>().toEqualTypeOf<() => Promise<void>>();

expectTypeOf<KVSetOptions>().toEqualTypeOf<{ ttl?: number }>();
expectTypeOf<KVLock>().toEqualTypeOf<{ readonly key: string; readonly token: string }>();
expectTypeOf<KV['set']>().parameters.toEqualTypeOf<[string, KVStoreValue, KVSetOptions?]>();
expectTypeOf<KV['set']>().returns.toEqualTypeOf<Promise<void>>();
expectTypeOf<KV['setIfAbsent']>().parameters.toEqualTypeOf<[string, KVStoreValue, KVSetOptions?]>();
expectTypeOf<KV['setIfAbsent']>().returns.toEqualTypeOf<Promise<boolean>>();
expectTypeOf<KV['acquireLock']>().toEqualTypeOf<
  (key: string, ttl: number) => Promise<KVLock | null>
>();
expectTypeOf<KV['extendLock']>().toEqualTypeOf<(lock: KVLock, ttl: number) => Promise<boolean>>();
expectTypeOf<KV['releaseLock']>().toEqualTypeOf<(lock: KVLock) => Promise<boolean>>();
expectTypeOf<KV['lock']>().toEqualTypeOf<
  <T>(key: string, ttl: number, fn: KVLockCallback<T>) => Promise<T>
>();
expectTypeOf<KVLockCallback<number>>().parameter(0).toEqualTypeOf<{ signal: AbortSignal }>();
expectTypeOf<KVLockCallback<number>>().returns.toEqualTypeOf<number | Promise<number>>();
expectTypeOf<() => number>().toMatchTypeOf<KVLockCallback<number>>();
expectTypeOf<() => Promise<number>>().toMatchTypeOf<KVLockCallback<number>>();
expectTypeOf<KV['get']>().toEqualTypeOf<
  <T extends KVStoreValue>(key: string) => Promise<T | null>
>();
expectTypeOf<KV['has']>().toEqualTypeOf<(key: string) => Promise<boolean>>();
expectTypeOf<KV['keys']>().toEqualTypeOf<() => Promise<string[]>>();
expectTypeOf<KV['delete']>().toEqualTypeOf<(key: string) => Promise<void>>();
expectTypeOf<KV['clear']>().toEqualTypeOf<() => Promise<void>>();

expectTypeOf<typeof databaseKVAdapter>().parameters.toEqualTypeOf<[DatabaseKVAdapterOptions?]>();
expectTypeOf<typeof databaseKVAdapter>().returns.toMatchTypeOf<KVAdapterResult>();
expectTypeOf<typeof rootDatabaseKVAdapter>().toEqualTypeOf<typeof databaseKVAdapter>();

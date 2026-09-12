# @frogbotai/kv-redis

Redis KV store adapter for [FrogBot](https://github.com/frogbotai/frogbot).

`frogbot.kv` provides key-value storage, expiration, atomic claims, and ownership-checked locks. It uses your application database by default; Redis is optional.

## Installation

```bash
pnpm add @frogbotai/kv-redis
```

## Redis configuration

Use Redis 6.2 or newer with Lua scripting enabled for TTL and lock operations.

```ts
import { buildConfig } from 'frogbot';
import { redisKVAdapter } from '@frogbotai/kv-redis';

export default buildConfig({
  kv: redisKVAdapter({
    redisURL: process.env.REDIS_URL,
    keyPrefix: 'my-app:kv:',
  }),
});
```

`redisURL` defaults to `REDIS_URL`. `keyPrefix` isolates keys in a shared Redis database. The adapter keeps its existing configuration and public `RedisKVAdapter.redisClient` (an ioredis client); atomic operations use that same connection. The `frogbot.kv` facade exposes the storage and lock API, not the Redis client.

## Database configuration

Omit `kv` to use FrogBot's database KV adapter. To customize its collection, use `databaseKVAdapter` from `frogbot/kv` (also exported from `frogbot`):

```ts
import { buildConfig } from 'frogbot';
import { databaseKVAdapter } from 'frogbot/kv';

export default buildConfig({
  kv: databaseKVAdapter({
    kvCollectionOverrides: {
      slug: 'app-kv',
      dbName: 'app_kv_records',
    },
  }),
});
```

The factory supplies required `key` (unique text) and `data` (JSON) fields, plus an indexed, nullable `expiresAt` date. Overrides must keep these fields stored and non-localized; `expiresAt` cannot have a default. Additional required fields need defaults compatible with native writes.

### Supported backends

| Backend                                              | TTL, atomic claims, and locks                   | Expiration clock             |
| ---------------------------------------------------- | ----------------------------------------------- | ---------------------------- |
| PostgreSQL via `@frogbotai/db-postgres`              | Supported                                       | Database `clock_timestamp()` |
| Local SQLite via `@frogbotai/db-sqlite`              | Supported with a `file:` URL and no `syncUrl`   | SQLite engine time           |
| MongoDB via `@frogbotai/db-mongodb`                  | Supported with the requirements below           | Database `$$NOW`             |
| Redis via `@frogbotai/kv-redis`                      | Supported on Redis 6.2+ with scripting          | Redis `TIME`                 |
| Remote or synced libSQL, D1, Vercel Postgres adapter | Unsupported; ordinary storage remains available | —                            |

MongoDB requires a transaction-capable replica set, automatically generated ObjectId IDs, and a unique, non-partial `key` index with simple collation. These requirements apply to all operations through FrogBot's database KV adapter, including ordinary reads and writes. Custom model defaults must produce valid documents; custom IDs and custom timestamp `currentTime` functions are unsupported. Timestamp field names must not overlap `_id`, `key`, `data`, or `expiresAt`.

Explicit third-party KV factories retain their ordinary storage behavior. FrogBot does not probe or automatically upgrade them, even if they use a database collection. TTL writes, `setIfAbsent`, and locks require an adapter that explicitly implements `KVAtomicAdapter` with `[kvAtomic]: true`; otherwise they reject with `KVUnsupportedError`. These exports are available from `frogbot/kv`.

## Storage API

All methods are asynchronous. Use string keys and JSON-serializable, non-null values.

| Method                              | Result and behavior                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `get<T>(key)`                       | `T \| null`; missing or expired entries return `null`.                                                                                 |
| `set(key, value, { ttl }?)`         | `void`; replaces the value. Omitting `ttl` stores it without expiration and removes any previous TTL.                                  |
| `has(key)`                          | `boolean`; expired entries return `false`.                                                                                             |
| `delete(key)`                       | `void`; removes the entry.                                                                                                             |
| `keys()`                            | `string[]`; excludes expired entries.                                                                                                  |
| `clear()`                           | `void`; removes all entries in this KV store, including locks. For Redis, limited to the configured prefix.                            |
| `setIfAbsent(key, value, { ttl }?)` | `boolean`; atomically writes only if the key is missing or expired. Returns `true` on success, `false` if a live entry already exists. |

```ts
await frogbot.kv.set('report:latest', { total: 42 }, { ttl: 60_000 });
const report = await frogbot.kv.get<{ total: number }>('report:latest');

const claimed = await frogbot.kv.setIfAbsent('event:123', true, {
  ttl: 300_000,
});
```

TTLs are **milliseconds** and must be positive safe integers. Zero, negative, fractional, non-finite, or unsafe values reject with `RangeError`. A valid integer can still exceed the backend's supported expiration range and be rejected rather than clamped: SQLite supports expiration through year 9999; PostgreSQL, MongoDB, and Redis cap expiration at `8_640_000_000_000_000` milliseconds since the Unix epoch.

Expiration uses the backend clock, not the application process's wall clock. An entry is expired at its deadline and immediately counts as absent for reads and claims, even before physical cleanup. Database entries with missing or `null` expiration do not expire.

## Locks

Locks share the KV keyspace with stored values. Reserve distinct keys for locks; ordinary `set`, `delete`, or `clear` operations do not check ownership. Processes coordinate only when they share the same store and namespace; separate local SQLite files do not coordinate replicas.

| Signature                                                                                                     | Behavior                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `acquireLock(key: string, ttl: number): Promise<KVLock \| null>`                                              | Claims the key with a unique token; returns `null` on contention. `KVLock` contains readonly `key` and `token` strings.                   |
| `extendLock(lock: KVLock, ttl: number): Promise<boolean>`                                                     | Sets a fresh TTL from backend time only if the token still owns a live lease. Returns `false` for an expired, missing, or replaced lease. |
| `releaseLock(lock: KVLock): Promise<boolean>`                                                                 | Deletes only a live lease with the matching token; otherwise returns `false`.                                                             |
| `lock<T>(key: string, ttl: number, fn: ({ signal }: { signal: AbortSignal }) => T \| Promise<T>): Promise<T>` | Acquires, renews, runs the callback, and attempts ownership-checked release. Returns the callback result on success.                      |

Keep the `KVLock` returned by acquisition for manual extension or release. An expired owner cannot extend or release a successor's lease. `KVLock` and lock error classes are exported from `frogbot/kv`.

### Scoped locks and cancellation

```ts
const report = await frogbot.kv.lock('lock:report:weekly', 30_000, async ({ signal }) => {
  signal.throwIfAborted();
  const response = await fetch('https://api.example.com/reports/weekly', { signal });
  return response.json();
});
```

- Contention rejects immediately with `KVLockContentionError`; the callback does not run and acquisition is not retried.
- Renewal runs serially, scheduled roughly every `ttl / 3` after acquisition or the previous renewal completes. The TTL is a renewable lease duration, not a total callback timeout.
- A local monotonic watchdog starts the first deadline **before acquisition**. Each successful renewal sets the next deadline to **renewal request start + TTL**, not response time. Acquisition and renewal latency consume lease time; renewal must succeed before the current deadline. A late response cannot revive a lost scope.
- A long or hung acquisition, renewal, or release cannot keep the scope waiting past its last confirmed deadline. Deadline or ownership loss aborts `signal` and rejects with `KVLeaseLostError`; renewal backend failures also abort and reject. Multiple observed failures can be reported as an `AggregateError`.
- Pass `signal` to cancellable work and check it before effects. Ownership tokens protect lock operations; they do **not fence external effects**. A callback that ignores cancellation can continue after the scope rejects, and an event-loop stall delays local abort delivery.

## Expiration cleanup

FrogBot's database KV factory registers `frogbot-cleanup-kv` hourly (`0 * * * *`) on the `default` jobs queue. Your existing jobs scheduler and runner must schedule and execute it; KV does not enable `autoRun` or create a separate runner. The task removes expired KV records only. Redis uses native expiration.

Cleanup reclaims storage; it is not a correctness dependency. Expired reads, claims, and ownership checks remain correct when cleanup is delayed or the jobs runner is stopped.

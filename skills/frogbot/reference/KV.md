# KV

Docs: https://docs.frogbot.ai and https://github.com/frogbotai/frogbot/blob/main/packages/kv-redis/README.md

This is the only FrogBot skill reference for KV. Use it as the documentation home for KV behavior and examples.

Access the configured store through `frogbot.kv` or `req.frogbot.kv`.

```ts
await frogbot.kv.set('settings', { theme: 'dark' });

const settings = await frogbot.kv.get('settings');
const exists = await frogbot.kv.has('settings');
const keys = await frogbot.kv.keys();

await frogbot.kv.delete('settings');
await frogbot.kv.clear();
```

`get` returns `null` for an absent or expired key. Values may be strings, numbers, booleans, null, arrays, or JSON objects. `clear` clears the configured store, not a namespace inferred from the caller.

## Expiry and conditional writes

```ts
await frogbot.kv.set('temporary', 'value', { ttl: 60_000 });

const claimed = await frogbot.kv.setIfAbsent('worker', 'worker-1', {
  ttl: 30_000,
});
```

TTL values are positive safe-integer milliseconds. Overwriting a key without a TTL removes its previous expiry. Expired values are absent from `get`, `has`, and `keys`; cleanup is not required for that visibility behavior.

The base configured adapter supports ordinary `get`, `set`, `has`, `keys`, `delete`, and `clear`. TTL writes, `setIfAbsent`, and lock operations require an adapter marked with FrogBot's `kvAtomic` capability. Unsupported operations throw `KVUnsupportedError`. Do not assume those operations exist for an arbitrary adapter.

## Locks

```ts
const result = await frogbot.kv.lock('report:123', 30_000, async ({ signal }) => {
  const response = await fetch('https://example.com/reports/123', { signal });

  return response.json();
});
```

`acquireLock` returns an opaque `{ key, token }` owner or `null` on contention. `extendLock` and `releaseLock` return false for expired, missing, or wrong-owner locks. `lock` manages acquisition, renewal, release, and an abort signal; it may throw `KVLockContentionError` or `KVLeaseLostError`.

Ownership checks prevent a stale owner from extending or releasing a successor's lease. They do not make an arbitrary sequence of reads and writes into a transaction. Use adapter-specific database transactions when a larger operation needs transactional guarantees.

## Adapters

Use `databaseKVAdapter()` for FrogBot's database-backed store or an adapter package such as `@frogbotai/kv-redis`. Database-backed behavior depends on the configured database's transaction support. Adapter authors can import `KVAtomicAdapter`, `KVDatabaseAdapter`, `kvAtomic`, and `validateKVTTL` from `frogbot/kv`.

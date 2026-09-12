import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import type { DrizzleAdapter } from '@payloadcms/drizzle';
import { sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { Payload } from 'payload';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sqliteAdapter } from '../../../../packages/db-sqlite/src/index.js';
import { createSQLKV } from '../../../../packages/frogbot/src/kv/adapters/sql.js';
import { KVUnsupportedError } from '../../../../packages/frogbot/src/kv/errors.js';
import { kvAtomic } from '../../../../packages/frogbot/src/kv/types.js';

const collectionSlug = 'customKVStore';
const table = sqliteTable('custom_store', {
  id: text('custom_id').primaryKey().$defaultFn(randomUUID),
  key: text('storage_key').notNull().unique(),
  data: text('stored_json', { mode: 'json' }).notNull(),
  expiresAt: text('expires_on'),
  createdAt: text('created_on').notNull(),
  updatedAt: text('updated_on').notNull(),
  extra: text('extra').notNull().default('retained'),
});

async function connect(url: string) {
  const adapter = sqliteAdapter({ client: { url }, push: false, busyTimeout: 1000 }).init({
    payload: { logger: { error: vi.fn() } } as unknown as Payload,
  });
  await adapter.connect!();
  adapter.tableNameMap.set('custom_k_v_store', 'custom_store');
  adapter.tables.custom_store = table;
  return adapter;
}

describe('SQL KV with local SQLite', () => {
  let directory: string;
  let adapters: Awaited<ReturnType<typeof connect>>[];
  let kv: ReturnType<typeof createSQLKV>;
  let other: ReturnType<typeof createSQLKV>;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'frogbot-kv-sql-'));
    adapters = await Promise.all([
      connect(`file:${directory}/kv.db`),
      connect(`file:${directory}/kv.db`),
    ]);
    await adapters[0].client.execute(`create table custom_store (
      custom_id text primary key,
      storage_key text not null unique,
      stored_json text not null,
      expires_on text,
      created_on text not null,
      updated_on text not null,
      extra text not null default 'retained'
    )`);
    await adapters[0].client.execute('create index custom_expiry on custom_store(expires_on)');
    kv = createSQLKV({ adapter: adapters[0], collectionSlug });
    other = createSQLKV({ adapter: adapters[1], collectionSlug });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const adapter of adapters ?? []) adapter.client.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('preserves JSON, custom mappings, defaults, and IDs on replacement', async () => {
    expect(kv[kvAtomic]).toBe(true);
    const value = { nested: [true, 0, '"quoted"'], date: new Date('2026-01-01T00:00:00Z') };
    await kv.set('key', value, { ttl: 10000 });
    expect(await other.get('key')).toEqual(JSON.parse(JSON.stringify(value)));
    const [before] = await adapters[0].drizzle.select().from(table);
    expect(before.id).toMatch(/^[\da-f-]{36}$/);
    expect(before.extra).toBe('retained');
    await kv.set('key', 'replacement');
    const [after] = await adapters[0].drizzle.select().from(table);
    expect(after.id).toBe(before.id);
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.expiresAt).toBeNull();
    expect(await other.get('key')).toBe('replacement');
    await kv.delete('key');
    expect(await kv.get('key')).toBeNull();
  });

  it('uses backend time with millisecond TTL precision despite worker clock skew', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Number.MAX_SAFE_INTEGER);
    await kv.set('key', 'value', { ttl: 1234 });
    const [{ remaining }] = await adapters[0].drizzle
      .select({
        remaining: sql<number>`(julianday(${table.expiresAt}) - julianday('now')) * 86400000`,
      })
      .from(table);
    expect(remaining).toBeGreaterThan(1000);
    expect(remaining).toBeLessThanOrEqual(1235);
    expect(await other.get('key')).toBe('value');
    expect(await other.has('key')).toBe(true);
  });

  it('hides expiry before cleanup while retaining legacy null expiry', async () => {
    await kv.set('expired', 'old', { ttl: 1000 });
    await kv.set('legacy', 'permanent');
    await adapters[0].drizzle
      .update(table)
      .set({ expiresAt: '2000-01-01T00:00:00.000Z' })
      .where(sql`${table.key} = ${'expired'}`);
    expect(await kv.get('expired')).toBeNull();
    expect(await kv.has('expired')).toBe(false);
    expect(await kv.keys()).toEqual(['legacy']);
    expect(await adapters[0].drizzle.select().from(table)).toHaveLength(2);
    await kv.cleanup();
    expect(await adapters[0].drizzle.select().from(table)).toHaveLength(1);
    expect(await kv.get('legacy')).toBe('permanent');
  });

  it('has exactly one winner across independent clients for missing and expired keys', async () => {
    const claim = () =>
      Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          (index % 2 ? kv : other).setIfAbsent('key', `owner-${index}`, { ttl: 10000 }),
        ),
      );
    expect((await claim()).filter(Boolean)).toHaveLength(1);
    await adapters[0].drizzle.update(table).set({ expiresAt: '2000-01-01T00:00:00.000Z' });
    expect((await claim()).filter(Boolean)).toHaveLength(1);
    expect(await kv.setIfAbsent('key', 'loser')).toBe(false);
    await kv.set('permanent', 'retained');
    expect(await other.setIfAbsent('permanent', 'loser', { ttl: 10 })).toBe(false);
    expect(await kv.get('permanent')).toBe('retained');
  });

  it('requires the current token and finite live expiry for renewal and release', async () => {
    const old = { key: 'lock', token: 'old' };
    const successor = { key: 'lock', token: 'successor' };
    await kv.setIfAbsent(old.key, old.token, { ttl: 10000 });
    expect(await other.extendLock(successor, 10000)).toBe(false);
    expect(await other.releaseLock(successor)).toBe(false);
    expect(await kv.extendLock(old, 20000)).toBe(true);
    await adapters[0].drizzle.update(table).set({ expiresAt: '2000-01-01T00:00:00.000Z' });
    expect(await kv.extendLock(old, 20000)).toBe(false);
    expect(await kv.releaseLock(old)).toBe(false);
    expect(await other.setIfAbsent(successor.key, successor.token, { ttl: 10000 })).toBe(true);
    expect(await kv.extendLock(old, 10000)).toBe(false);
    expect(await kv.releaseLock(old)).toBe(false);
    expect(await other.get('lock')).toBe(successor.token);
    expect(await other.releaseLock(successor)).toBe(true);
    expect(await other.releaseLock(successor)).toBe(false);
    await kv.set(old.key, old.token);
    expect(await kv.extendLock(old, 10000)).toBe(false);
    expect(await kv.releaseLock(old)).toBe(false);
    await adapters[0].drizzle.update(table).set({ expiresAt: 'infinity' });
    expect(await kv.extendLock(old, 10000)).toBe(false);
    expect(await kv.releaseLock(old)).toBe(false);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, 253402300799999])(
    'rejects invalid or overflowing TTL %s without changing state',
    async (ttl) => {
      await kv.set('key', 'original');
      await expect(kv.set('key', 'changed', { ttl })).rejects.toBeInstanceOf(RangeError);
      await expect(kv.setIfAbsent('key', 'changed', { ttl })).rejects.toBeInstanceOf(RangeError);
      await expect(kv.setIfAbsent('missing', 'changed', { ttl })).rejects.toBeInstanceOf(
        RangeError,
      );
      await expect(kv.extendLock({ key: 'missing', token: 'token' }, ttl)).rejects.toBeInstanceOf(
        RangeError,
      );
      expect(await kv.get('key')).toBe('original');
      expect(await kv.has('missing')).toBe(false);
    },
  );

  it('routes every operation to primaryDrizzle when a replica wrapper exists', async () => {
    const adapter = adapters[0] as unknown as DrizzleAdapter;
    adapter.primaryDrizzle = adapter.drizzle as DrizzleAdapter['primaryDrizzle'];
    adapter.drizzle = new Proxy(adapter.drizzle, {
      get() {
        throw new Error('replica accessed');
      },
    });
    await kv.set('key', 'value');
    expect(await kv.get('key')).toBe('value');
    expect(await kv.has('key')).toBe(true);
    expect(await kv.keys()).toEqual(['key']);
    expect(await kv.setIfAbsent('lock', 'token', { ttl: 10000 })).toBe(true);
    expect(await kv.extendLock({ key: 'lock', token: 'token' }, 10000)).toBe(true);
    await kv.cleanup();
    expect(await kv.releaseLock({ key: 'lock', token: 'token' })).toBe(true);
    await kv.delete('key');
    await kv.clear();
    expect(await kv.keys()).toEqual([]);
  });

  it('rejects overflow inside the mutation if validation has become stale', async () => {
    await kv.set('key', 'original');
    const select = vi.spyOn(adapters[0].drizzle, 'select');
    select.mockReturnValueOnce({
      from: () => Promise.resolve([{ remaining: Number.MAX_SAFE_INTEGER }]),
    } as unknown as ReturnType<(typeof adapters)[0]['drizzle']['select']>);
    await expect(kv.set('key', 'changed', { ttl: 253402300799999 })).rejects.toBeInstanceOf(
      RangeError,
    );
    expect(await kv.get('key')).toBe('original');
  });

  it('rejects unqualified transports clearly', () => {
    const adapter = adapters[0];
    for (const packageName of ['@payloadcms/db-d1-sqlite', '@payloadcms/db-vercel-postgres']) {
      expect(() => createSQLKV({ adapter: { ...adapter, packageName }, collectionSlug })).toThrow(
        KVUnsupportedError,
      );
    }
    adapter.clientConfig.url = 'libsql://remote.example';
    expect(() => createSQLKV({ adapter, collectionSlug })).toThrow(/remote or replicated libSQL/);
    adapter.clientConfig.url = 'file:local.db';
    adapter.clientConfig.syncUrl = 'libsql://remote.example';
    expect(() => createSQLKV({ adapter, collectionSlug })).toThrow(KVUnsupportedError);
  });

  it('propagates backend errors without interpreting them as contention or TTL overflow', async () => {
    await adapters[0].client.execute('drop table custom_store');
    await expect(kv.setIfAbsent('key', 'value', { ttl: 1000 })).rejects.not.toBeInstanceOf(
      RangeError,
    );
    await expect(kv.releaseLock({ key: 'key', token: 'value' })).rejects.toThrow();
  });

  it.each(['set', 'setIfAbsent'] as const)(
    'starts the %s TTL after a SQLite writer busy wait',
    async (operation) => {
      const worker = new Worker(
        `
      const { parentPort, workerData } = require('node:worker_threads');
      const Database = require(workerData.module);
      const db = new Database(workerData.path);
      db.exec('begin immediate');
      db.prepare('insert into custom_store(custom_id, storage_key, stored_json, created_on, updated_on) values (?, ?, ?, ?, ?)')
        .run('blocked', 'key', '"uncommitted"', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
      parentPort.once('message', () => setTimeout(() => {
        db.exec('rollback');
        db.close();
        parentPort.postMessage('released');
      }, 500));
      parentPort.postMessage('ready');
    `,
        {
          eval: true,
          workerData: {
            module: createRequire(import.meta.url).resolve('libsql'),
            path: join(directory, 'kv.db'),
          },
        },
      );
      try {
        await once(worker, 'message');
        const released = once(worker, 'message');
        worker.postMessage('release');
        expect(await kv[operation]('key', 'winner', { ttl: 200 })).toBe(
          operation === 'set' ? undefined : true,
        );
        await released;
        const [{ remaining }] = await adapters[0].drizzle
          .select({
            remaining: sql<number>`(julianday(${table.expiresAt}) - julianday('now')) * 86400000`,
          })
          .from(table);
        expect(remaining).toBeGreaterThan(100);
        expect(remaining).toBeLessThanOrEqual(201);
        expect(await kv.get('key')).toBe('winner');
      } finally {
        await worker.terminate();
      }
    },
  );
});

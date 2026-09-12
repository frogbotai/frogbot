import { randomUUID } from 'node:crypto';

import { postgresAdapter } from '@frogbotai/db-postgres';
import type { RawTable } from '@payloadcms/drizzle';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { withReplicas } from 'drizzle-orm/pg-core';
import type { Payload } from 'payload';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSQLKV } from '../../packages/frogbot/src/kv/adapters/sql.js';

const schemaName = `kv_sql_${randomUUID().replaceAll('-', '')}`;
const collectionSlug = 'customKVStore';
const tableName = 'custom_store';
const rawTable: RawTable = {
  name: tableName,
  columns: {
    id: { name: 'custom_id', type: 'uuid', primaryKey: true, defaultV7: true },
    key: { name: 'storage_key', type: 'text', notNull: true },
    data: { name: 'stored_json', type: 'jsonb', notNull: true },
    expiresAt: {
      name: 'expires_on',
      type: 'timestamp',
      mode: 'string',
      precision: 3,
      withTimezone: true,
    },
    createdAt: {
      name: 'created_on',
      type: 'timestamp',
      mode: 'string',
      precision: 3,
      withTimezone: true,
      notNull: true,
    },
    updatedAt: {
      name: 'updated_on',
      type: 'timestamp',
      mode: 'string',
      precision: 3,
      withTimezone: true,
      notNull: true,
    },
    extra: { name: 'extra', type: 'text', notNull: true, default: 'retained' },
  },
  indexes: {
    key: { name: 'custom_key', unique: true, on: 'key' },
    expiresAt: { name: 'custom_expiry', on: 'expiresAt' },
  },
};

async function connect() {
  const adapter = postgresAdapter({
    schemaName,
    push: false,
    pool: {
      connectionString: 'postgres://frogbot:frogbot@localhost:5433/frogbot',
      application_name: schemaName,
      max: 6,
    },
    beforeSchemaInit: [
      ({ adapter, schema }) => {
        adapter.tableNameMap.set('custom_k_v_store', tableName);
        adapter.rawTables[tableName] = rawTable;
        return schema;
      },
    ],
  }).init({
    payload: {
      config: { collections: [], globals: [], localization: false },
      logger: { warn: vi.fn(), error: vi.fn() },
    } as unknown as Payload,
  });
  await adapter.init?.();
  adapter.pool = new adapter.pg.Pool(adapter.poolOptions);
  adapter.drizzle = drizzle({ client: adapter.pool, schema: adapter.schema });
  return adapter;
}

describe('SQL KV with PostgreSQL', () => {
  let adapters: Awaited<ReturnType<typeof connect>>[] = [];
  let kv: ReturnType<typeof createSQLKV>;
  let other: ReturnType<typeof createSQLKV>;

  async function waitForBlockedQuery() {
    await expect
      .poll(async () => {
        const result = await adapters[1].drizzle.execute<{
          count: string;
        }>(sql`select count(*)::text as count from pg_stat_activity
        where application_name = ${schemaName} and wait_event_type = 'Lock'`);
        return Number(result.rows[0].count);
      })
      .toBeGreaterThan(0);
  }

  beforeAll(async () => {
    adapters = await Promise.all([connect(), connect()]);
    const db = adapters[0].drizzle;
    const table = adapters[0].tables[tableName];
    await db.execute(sql`create schema ${sql.identifier(schemaName)}`);
    await db.execute(sql`create table ${table} (
      custom_id uuid primary key,
      storage_key text not null unique,
      stored_json jsonb not null,
      expires_on timestamptz(3),
      created_on timestamptz(3) not null,
      updated_on timestamptz(3) not null,
      extra text not null default 'retained'
    )`);
    await db.execute(sql`create index custom_expiry on ${table} (expires_on)`);
    kv = createSQLKV({ adapter: adapters[0], collectionSlug });
    other = createSQLKV({ adapter: adapters[1], collectionSlug });
  });

  beforeEach(async () => {
    await kv.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      if (adapters[0]) {
        await adapters[0].drizzle.execute(
          sql`drop schema if exists ${sql.identifier(schemaName)} cascade`,
        );
      }
    } finally {
      await Promise.all(adapters.map((adapter) => adapter.pool.end()));
    }
  });

  it('preserves generated custom columns, JSON encoding, UUID defaults, and replacement IDs', async () => {
    const table = adapters[0].tables[tableName];
    const value = {
      quote: "'quoted'",
      nested: [true, 0, null],
      date: new Date('2026-01-01T00:00:00Z'),
    };
    await kv.set('key', value, { ttl: 10000 });
    expect(await other.get('key')).toEqual(JSON.parse(JSON.stringify(value)));
    const [before] = await adapters[0].drizzle.select().from(table);
    expect(before.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[\da-f]{4}-[\da-f]{12}$/);
    expect(before.extra).toBe('retained');
    expect(Number.isFinite(Date.parse(before.expiresAt))).toBe(true);
    await kv.set('key', 'replacement');
    const [after] = await adapters[0].drizzle.select().from(table);
    expect(after.id).toBe(before.id);
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.expiresAt).toBeNull();
    expect(await other.get('key')).toBe('replacement');
  });

  it('has exactly one winner across independent pools for missing and expired keys', async () => {
    const claim = () =>
      Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          (index % 2 ? kv : other).setIfAbsent('key', `owner-${index}`, { ttl: 10000 }),
        ),
      );
    expect((await claim()).filter(Boolean)).toHaveLength(1);
    const table = adapters[0].tables[tableName];
    await adapters[0].drizzle
      .update(table)
      .set({ expiresAt: sql`clock_timestamp() - interval '1 second'` });
    expect(await kv.get('key')).toBeNull();
    expect(await kv.has('key')).toBe(false);
    expect(await kv.keys()).toEqual([]);
    expect((await claim()).filter(Boolean)).toHaveLength(1);
    expect(await kv.setIfAbsent('key', 'loser')).toBe(false);
  });

  it('requires a matching token with finite unexpired ownership', async () => {
    const owner = { key: 'lock', token: 'owner' };
    const successor = { key: 'lock', token: 'successor' };
    const table = adapters[0].tables[tableName];
    await kv.set(owner.key, owner.token, { ttl: 10000 });
    expect(await other.extendLock(successor, 10000)).toBe(false);
    expect(await other.releaseLock(successor)).toBe(false);
    expect(await kv.extendLock(owner, 20000)).toBe(true);
    await adapters[0].drizzle
      .update(table)
      .set({ expiresAt: sql`clock_timestamp() - interval '1 second'` });
    expect(await kv.extendLock(owner, 10000)).toBe(false);
    expect(await kv.releaseLock(owner)).toBe(false);
    expect(await other.setIfAbsent(successor.key, successor.token, { ttl: 10000 })).toBe(true);
    expect(await kv.extendLock(owner, 10000)).toBe(false);
    expect(await kv.releaseLock(owner)).toBe(false);
    expect(await other.releaseLock(successor)).toBe(true);
    for (const expiresAt of [null, sql`'infinity'::timestamptz`, sql`'-infinity'::timestamptz`]) {
      await kv.set(owner.key, owner.token);
      await adapters[0].drizzle.update(table).set({ expiresAt });
      expect(await kv.extendLock(owner, 10000)).toBe(false);
      expect(await kv.releaseLock(owner)).toBe(false);
    }
  });

  it('uses advancing backend time inside a long transaction despite worker clock skew', async () => {
    const client = await adapters[0].pool.connect();
    const primary = adapters[0].primaryDrizzle;
    try {
      vi.spyOn(Date, 'now').mockReturnValue(Number.MAX_SAFE_INTEGER);
      await kv.set('short', 'value', { ttl: 100 });
      await client.query('begin');
      adapters[0].primaryDrizzle = drizzle(client);
      await client.query('select pg_sleep(0.15)');
      expect(await kv.get('short')).toBeNull();
      expect(await kv.has('short')).toBe(false);
      expect(await kv.keys()).toEqual([]);
      await kv.cleanup();
      const table = adapters[0].tables[tableName];
      expect(await adapters[0].primaryDrizzle.select().from(table)).toHaveLength(0);
    } finally {
      adapters[0].primaryDrizzle = primary;
      await client.query('rollback');
      client.release();
    }
  });

  it('rejects overflow without mutation and accepts expiration near the maximum Date', async () => {
    const max = 8640000000000000;
    const result = await adapters[0].drizzle.execute<{ now: string }>(
      sql`select floor(extract(epoch from clock_timestamp()) * 1000)::text as now`,
    );
    const remaining = max - Number(result.rows[0].now);
    await kv.set('key', 'original');
    for (const ttl of [Number.MAX_SAFE_INTEGER, remaining + 60000]) {
      await expect(kv.set('key', 'changed', { ttl })).rejects.toBeInstanceOf(RangeError);
      await expect(kv.setIfAbsent('absent', 'changed', { ttl })).rejects.toBeInstanceOf(RangeError);
      await expect(kv.extendLock({ key: 'absent', token: 'none' }, ttl)).rejects.toBeInstanceOf(
        RangeError,
      );
      expect(await kv.get('key')).toBe('original');
      expect(await kv.has('absent')).toBe(false);
    }
    await kv.set('near-max', 'valid', { ttl: remaining - 10000 });
    const table = adapters[0].tables[tableName];
    const [{ expiry }] = await adapters[0].drizzle
      .select({
        expiry: sql<string>`(extract(epoch from ${table.expiresAt}) * 1000)::text`,
      })
      .from(table)
      .where(sql`${table.key} = ${'near-max'}`);
    expect(Number(expiry)).toBeGreaterThanOrEqual(max - 10000);
    expect(Number(expiry)).toBeLessThanOrEqual(max);
    expect(await other.get('near-max')).toBe('valid');
  });

  it('routes every operation around a real replica wrapper to the primary', async () => {
    const adapter = adapters[0];
    const original = adapter.drizzle;
    adapter.primaryDrizzle = original;
    adapter.drizzle = withReplicas(original, [adapters[1].drizzle]);
    vi.spyOn(adapters[1].drizzle, 'select').mockImplementation(() => {
      throw new Error('replica accessed');
    });
    try {
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
    } finally {
      adapter.drizzle = original;
      adapter.primaryDrizzle = undefined;
    }
  });

  it.each(['extendLock', 'releaseLock'] as const)(
    'rejects %s after a row lock wait crosses expiry',
    async (operation) => {
      const owner = { key: 'lock', token: 'owner' };
      await kv.set(owner.key, owner.token, { ttl: 1000 });
      const blocker = await adapters[1].pool.connect();
      const db = drizzle(blocker);
      const table = adapters[1].tables[tableName];
      let pending: Promise<boolean> | undefined;
      try {
        await blocker.query('begin');
        await db
          .select()
          .from(table)
          .where(sql`${table.key} = ${owner.key}`)
          .for('update');
        pending = operation === 'extendLock' ? kv.extendLock(owner, 10000) : kv.releaseLock(owner);
        await waitForBlockedQuery();
        await blocker.query('select pg_sleep(1.1)');
        await blocker.query('commit');
        expect(await pending).toBe(false);
        const [row] = await adapters[1].drizzle.select().from(table);
        expect(row.data).toBe(owner.token);
        expect(await other.get(owner.key)).toBeNull();
        expect(await other.setIfAbsent(owner.key, 'successor', { ttl: 10000 })).toBe(true);
      } finally {
        await blocker.query('rollback');
        blocker.release();
        await pending?.catch(() => {});
      }
    },
  );

  it.each(['set', 'setIfAbsent', 'extendLock'] as const)(
    'starts the %s TTL after a row lock wait',
    async (operation) => {
      const owner = { key: 'lock', token: 'owner' };
      const table = adapters[0].tables[tableName];
      await kv.set(owner.key, owner.token, { ttl: 10000 });
      if (operation === 'setIfAbsent') {
        await adapters[0].drizzle
          .update(table)
          .set({ expiresAt: sql`clock_timestamp() - interval '1 second'` });
      }
      const blocker = await adapters[1].pool.connect();
      let pending: Promise<boolean | void> | undefined;
      try {
        await blocker.query('begin');
        await drizzle(blocker).select().from(table).for('update');
        pending =
          operation === 'extendLock'
            ? kv.extendLock(owner, 400)
            : kv[operation](owner.key, owner.token, { ttl: 400 });
        await waitForBlockedQuery();
        await blocker.query('select pg_sleep(0.6)');
        await blocker.query('commit');
        expect(await pending).toBe(operation === 'set' ? undefined : true);
        expect(await other.has(owner.key)).toBe(true);
        const [{ remaining }] = await adapters[0].drizzle
          .select({
            remaining:
              sql<number>`extract(epoch from (${table.expiresAt} - clock_timestamp())) * 1000`.mapWith(
                Number,
              ),
          })
          .from(table);
        expect(remaining).toBeGreaterThan(200);
        expect(remaining).toBeLessThanOrEqual(400);
      } finally {
        await blocker.query('rollback');
        blocker.release();
        await pending?.catch(() => {});
      }
    },
  );

  it.each(['set', 'setIfAbsent'] as const)(
    'starts the %s TTL after a competing insertion rolls back',
    async (operation) => {
      const table = adapters[0].tables[tableName];
      const blocker = await adapters[1].pool.connect();
      let pending: Promise<boolean | void> | undefined;
      try {
        await blocker.query('begin');
        await drizzle(blocker)
          .insert(table)
          .values({
            key: 'key',
            data: 'uncommitted',
            createdAt: sql`clock_timestamp()`,
            updatedAt: sql`clock_timestamp()`,
          });
        pending = kv[operation]('key', 'winner', { ttl: 200 });
        await waitForBlockedQuery();
        expect(await other.get('key')).toBeNull();
        await blocker.query('select pg_sleep(0.5)');
        await blocker.query('rollback');
        expect(await pending).toBe(operation === 'set' ? undefined : true);
        const [{ remaining }] = await adapters[0].drizzle
          .select({
            remaining:
              sql<number>`extract(epoch from (${table.expiresAt} - clock_timestamp())) * 1000`.mapWith(
                Number,
              ),
          })
          .from(table);
        expect(remaining).toBeGreaterThan(100);
        expect(remaining).toBeLessThanOrEqual(200);
        expect(await other.get('key')).toBe('winner');
      } finally {
        await blocker.query('rollback');
        blocker.release();
        await pending?.catch(() => undefined);
      }
    },
  );

  it.each(['set', 'setIfAbsent', 'extendLock'] as const)(
    'rejects %s overflow introduced by a row lock wait without changing state',
    async (operation) => {
      const owner = { key: 'lock', token: 'owner' };
      const table = adapters[0].tables[tableName];
      await kv.set(owner.key, owner.token, { ttl: 10000 });
      if (operation === 'setIfAbsent') {
        await adapters[0].drizzle
          .update(table)
          .set({ expiresAt: sql`clock_timestamp() - interval '1 second'` });
      }
      const [before] = await adapters[0].drizzle.select().from(table);
      const blocker = await adapters[1].pool.connect();
      let pending: Promise<unknown> | undefined;
      try {
        await blocker.query('begin');
        await drizzle(blocker).select().from(table).for('update');
        const [{ ttl }] = await adapters[0].drizzle
          .select({
            ttl: sql<number>`8640000000000000 - floor(extract(epoch from clock_timestamp()) * 1000) - 500`.mapWith(
              Number,
            ),
          })
          .from(sql`(select 1) as kv_clock`);
        pending = (
          operation === 'extendLock'
            ? kv.extendLock(owner, ttl)
            : kv[operation](owner.key, 'changed', { ttl })
        ).then(
          () => null,
          (error: unknown) => error,
        );
        await waitForBlockedQuery();
        await blocker.query('select pg_sleep(0.8)');
        await blocker.query('commit');
        expect(await pending).toBeInstanceOf(RangeError);
        const [after] = await adapters[0].drizzle.select().from(table);
        expect(after).toEqual(before);
      } finally {
        await blocker.query('rollback');
        blocker.release();
        await pending;
      }
    },
  );

  it.each(['set', 'setIfAbsent'] as const)(
    'rolls back the %s insertion when its delayed deadline overflows',
    async (operation) => {
      const table = adapters[0].tables[tableName];
      const blocker = await adapters[1].pool.connect();
      let pending: Promise<unknown> | undefined;
      try {
        await blocker.query('begin');
        await drizzle(blocker)
          .insert(table)
          .values({
            key: 'key',
            data: 'uncommitted',
            createdAt: sql`clock_timestamp()`,
            updatedAt: sql`clock_timestamp()`,
          });
        const [{ ttl }] = await adapters[0].drizzle
          .select({
            ttl: sql<number>`8640000000000000 - floor(extract(epoch from clock_timestamp()) * 1000) - 300`.mapWith(
              Number,
            ),
          })
          .from(sql`(select 1) as kv_clock`);
        pending = kv[operation]('key', 'winner', { ttl }).then(
          () => null,
          (error: unknown) => error,
        );
        await waitForBlockedQuery();
        await blocker.query('select pg_sleep(0.5)');
        await blocker.query('rollback');
        expect(await pending).toBeInstanceOf(RangeError);
        expect(await adapters[0].drizzle.select().from(table)).toHaveLength(0);
      } finally {
        await blocker.query('rollback');
        blocker.release();
        await pending;
      }
    },
  );

  it('rolls back instead of committing a placeholder when finalization returns no row', async () => {
    const db = adapters[0].drizzle;
    const table = adapters[0].tables[tableName];
    const guard = sql`${sql.identifier(schemaName)}.${sql.identifier('suppress_expiration')}`;
    await kv.set('existing', 'original');
    const [before] = await db.select().from(table);
    await db.execute(sql`create function ${guard}() returns trigger language plpgsql as $$
      begin
        if new.expires_on is not null and old.expires_on is null then return null; end if;
        return new;
      end;
    $$`);
    try {
      await db.execute(sql`create trigger suppress_expiration before update on ${table}
        for each row execute function ${guard}()`);
      await expect(kv.set('existing', 'changed', { ttl: 1000 })).rejects.toThrow(
        'could not finalize expiration',
      );
      await expect(kv.set('new', 'changed', { ttl: 1000 })).rejects.toThrow(
        'could not finalize expiration',
      );
      await expect(kv.setIfAbsent('new', 'changed', { ttl: 1000 })).rejects.toThrow(
        'could not finalize expiration',
      );
      expect(await db.select().from(table)).toEqual([before]);
    } finally {
      await db.execute(sql`drop trigger if exists suppress_expiration on ${table}`);
      await db.execute(sql`drop function ${guard}()`);
    }
  });

  it('retains the expiration predicate when cleanup races a renewal', async () => {
    const table = adapters[0].tables[tableName];
    await kv.set('key', 'value', { ttl: 10000 });
    await adapters[0].drizzle
      .update(table)
      .set({ expiresAt: sql`clock_timestamp() - interval '1 second'` });
    const blocker = await adapters[1].pool.connect();
    let pending: Promise<void> | undefined;
    try {
      await blocker.query('begin');
      await drizzle(blocker)
        .update(table)
        .set({ expiresAt: sql`clock_timestamp() + interval '10 seconds'` });
      pending = kv.cleanup();
      await waitForBlockedQuery();
      await blocker.query('commit');
      await pending;
      expect(await kv.get('key')).toBe('value');
    } finally {
      await blocker.query('rollback');
      blocker.release();
      await pending?.catch(() => {});
    }
  });
});

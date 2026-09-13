import type { DrizzleAdapter, PostgresDB, SQLiteDB } from '@payloadcms/drizzle';
import type { SQL } from 'drizzle-orm';
import { and, getTableColumns, isNull, or, sql } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { BaseDatabaseAdapter, KVStoreValue } from 'payload';
import toSnakeCase from 'to-snake-case';

import { KVUnsupportedError } from '../errors.js';
import type { KVDatabaseAdapter, KVLock, KVSetOptions } from '../types.js';
import { kvAtomic } from '../types.js';
import { validateKVTTL } from '../validateTTL.js';

type SQLKVTable = SQLiteTable & {
  data: SQLiteColumn;
  expiresAt: SQLiteColumn;
  key: SQLiteColumn;
};

const overflowMarker = 'frogbot_kv_ttl_overflow';

function unsupported(message: string): never {
  const error = new KVUnsupportedError();
  error.message = message;
  throw error;
}

async function mutation<T>(query: PromiseLike<T>): Promise<T> {
  try {
    return await query;
  } catch (error) {
    let cause = error;
    while (cause instanceof Error && cause.cause instanceof Error) cause = cause.cause;
    if (cause instanceof Error && cause.message.includes(overflowMarker)) {
      throw new RangeError('KV ttl exceeds the SQL expiration range', { cause: error });
    }
    throw error;
  }
}

export function createSQLKV({
  adapter: input,
  collectionSlug,
}: {
  adapter: BaseDatabaseAdapter;
  collectionSlug: string;
}): KVDatabaseAdapter {
  const adapter = input as DrizzleAdapter;
  const sqlite = adapter.name === 'sqlite';
  const maxExpiration = sqlite ? 253402300799999 : 8640000000000000;

  if (sqlite && ['@payloadcms/db-sqlite', '@frogbotai/db-sqlite'].includes(adapter.packageName)) {
    const { clientConfig } = adapter as DrizzleAdapter & {
      clientConfig?: { syncUrl?: string; url?: string };
    };
    if (!clientConfig?.url?.startsWith('file:') || clientConfig.syncUrl) {
      unsupported('SQL KV requires local SQLite; remote or replicated libSQL is not qualified');
    }
  } else if (
    adapter.name !== 'postgres' ||
    !['@payloadcms/db-postgres', '@frogbotai/db-postgres'].includes(adapter.packageName)
  ) {
    unsupported(
      'SQL KV supports local SQLite and PostgreSQL; D1 and Vercel transports are not qualified',
    );
  }

  const tableName = adapter.tableNameMap?.get(toSnakeCase(collectionSlug));
  const mappedTable = tableName ? (adapter.tables[tableName] as SQLKVTable | undefined) : undefined;
  if (!mappedTable?.key || !mappedTable.data || !mappedTable.expiresAt) {
    unsupported(`SQL KV collection "${collectionSlug}" requires key, data, and expiresAt columns`);
  }

  const table = mappedTable;
  const columns = getTableColumns(table);
  const primary = () => (adapter.primaryDrizzle ?? adapter.drizzle) as SQLiteDB;
  const now = sqlite ? sql`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` : sql`clock_timestamp()`;
  const nowMilliseconds = sqlite
    ? sql`cast(strftime('%s', 'now') as integer) * 1000 + cast(substr(strftime('%f', 'now'), 4, 3) as integer)`
    : sql`floor(extract(epoch from clock_timestamp()) * 1000)`;
  const expiryTime = sqlite ? sql`julianday(${table.expiresAt})` : sql`${table.expiresAt}`;
  const currentTime = sqlite ? sql`julianday('now')` : now;
  const finite = sqlite ? sql`${expiryTime} is not null` : sql`isfinite(${table.expiresAt})`;
  const expired = and(finite, sql`${expiryTime} <= ${currentTime}`);
  const live = and(finite, sql`${expiryTime} > ${currentTime}`);
  const readable = or(isNull(table.expiresAt), live);
  const owned = ({ key, token }: KVLock) =>
    and(sql`${table.key} = ${key}`, sql`${table.data} = ${JSON.stringify(token)}`, live);

  async function expiration(ttl?: number) {
    if (ttl === undefined) return null;
    validateKVTTL(ttl);
    const [{ remaining }] = await primary()
      .select({
        remaining: sql<number>`${maxExpiration} - (${nowMilliseconds})`.mapWith(Number),
      })
      .from(sql`(select 1) as kv_clock`);
    if (!Number.isSafeInteger(remaining) || ttl > remaining) {
      throw new RangeError('KV ttl exceeds the SQL expiration range');
    }

    if (sqlite) {
      const value = sql`strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ${`${ttl / 1000} seconds`})`;
      return sql`case when ${value} is not null then ${value} else json_extract('null', ${overflowMarker}) end`;
    }

    return sql`(select cast(case when extract(epoch from deadline) * 1000 <= ${maxExpiration}
      then deadline::text else ${overflowMarker} end as timestamptz)
      from (select date_trunc('milliseconds', clock_timestamp()) + ${`${ttl} milliseconds`}::interval as deadline) as kv_expiration)`;
  }

  async function write({
    key,
    value,
    options,
    ifAbsent,
  }: {
    key: string;
    value: KVStoreValue;
    options?: KVSetOptions;
    ifAbsent: boolean;
  }): Promise<boolean> {
    const expiresAt = await expiration(options?.ttl);
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new TypeError('KV value must be JSON serializable');

    const data = sqlite ? sql`${serialized}` : sql`${serialized}::jsonb`;
    const timestamps = columns.updatedAt ? { updatedAt: now } : {};
    const insert = (db: SQLiteDB, deadline: SQL | null) => {
      const updates = { data, expiresAt: deadline, ...timestamps };
      return db
        .insert(table)
        .values({
          ...updates,
          key,
          ...(columns.createdAt ? { createdAt: now } : {}),
        })
        .onConflictDoUpdate({
          target: table.key,
          set: updates,
          setWhere: ifAbsent ? expired : undefined,
        })
        .returning({ key: table.key });
    };

    if (sqlite || expiresAt === null) {
      const rows = await mutation(insert(primary(), expiresAt));
      return rows.length > 0;
    }

    const db = primary() as unknown as PostgresDB;
    return mutation(
      db.transaction(async (transaction) => {
        const writer = transaction as unknown as SQLiteDB;
        const inserted = await insert(writer, null);
        if (!inserted.length) return false;
        const finalized = await writer
          .update(table)
          .set({ expiresAt, ...timestamps })
          .where(sql`${table.key} = ${key}`)
          .returning({ key: table.key });
        if (!finalized.length) throw new Error('SQL KV could not finalize expiration');
        return true;
      }),
    );
  }

  async function ownership({ lock, expiresAt }: { lock: KVLock; expiresAt?: SQL | null }) {
    if (sqlite) {
      if (Object.keys(adapter.sessions).length) return false;
      const query =
        expiresAt === undefined
          ? primary().delete(table)
          : primary()
              .update(table)
              .set({ expiresAt, ...(columns.updatedAt ? { updatedAt: now } : {}) });
      const rows = await mutation(query.where(owned(lock)).returning());
      return rows.length > 0;
    }

    const change =
      expiresAt === undefined
        ? sql`delete from ${table}`
        : sql`update ${table} set ${sql.identifier(table.expiresAt.name)} = ${expiresAt}
          ${columns.updatedAt ? sql`, ${sql.identifier(columns.updatedAt.name)} = ${now}` : sql``}`;
    const db = primary() as unknown as PostgresDB;
    const result = await mutation(
      db.execute(sql`
      with kv_owner as materialized (
        select ${table.key} as key, ${table.data} as data, ${table.expiresAt} as expires_at
        from ${table} where ${table.key} = ${lock.key} for update
      )
      ${change}
      where ${table.key} = ${lock.key} and exists (
        select 1 from kv_owner where key = ${lock.key}
          and data = ${JSON.stringify(lock.token)}::jsonb
          and isfinite(expires_at) and expires_at > clock_timestamp()
      )
      returning ${table.key}
    `),
    );

    return result.rows.length > 0;
  }

  return {
    [kvAtomic]: true,
    async cleanup() {
      await primary().delete(table).where(expired);
    },
    async clear() {
      await primary().delete(table);
    },
    async delete(key) {
      await primary()
        .delete(table)
        .where(sql`${table.key} = ${key}`);
    },
    async extendLock(lock, ttl) {
      validateKVTTL(ttl);
      const expiresAt = await expiration(ttl);
      return ownership({ lock, expiresAt });
    },
    async get<T extends KVStoreValue>(key: string): Promise<T | null> {
      const rows = await primary()
        .select({ data: table.data })
        .from(table)
        .where(and(sql`${table.key} = ${key}`, readable))
        .limit(1);
      return rows.length ? (rows[0].data as T) : null;
    },
    async has(key) {
      const rows = await primary()
        .select({ key: table.key })
        .from(table)
        .where(and(sql`${table.key} = ${key}`, readable))
        .limit(1);
      return rows.length > 0;
    },
    async keys() {
      const rows = await primary().select({ key: table.key }).from(table).where(readable);
      return rows.map((row) => row.key as string);
    },
    async releaseLock(lock) {
      return ownership({ lock });
    },
    async set(key, value, options) {
      await write({ key, value, options, ifAbsent: false });
    },
    async setIfAbsent(key, value, options) {
      return write({ key, value, options, ifAbsent: true });
    },
  };
}

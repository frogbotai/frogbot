import { is } from 'drizzle-orm';
import { PgDatabase } from 'drizzle-orm/pg-core';
import type { BaseSQLiteDatabase, SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { PayloadRequest } from 'payload';
import toSnakeCase from 'to-snake-case';

import type { FrogBotRequest } from '../types/request.js';
import { getDatabase, sessionDatabase, toColumns } from './compareAndSet.js';
import { assertDrizzleAdapter } from './guards.js';

export type InsertIfMissingProps = {
  req: FrogBotRequest | PayloadRequest;
  collection: string;
  data: Record<string, unknown>;
  /** A unique top-level field; a row that already holds this value is left alone. */
  target: string;
};

/**
 * Inserts a row unless one with the same `target` value exists, on the request's
 * transaction. It never raises a unique violation, so a Postgres transaction that
 * races another insert of the same value survives: the insert waits for the other
 * transaction and then does nothing.
 */
export async function insertIfMissing({
  req,
  collection,
  data,
  target,
}: InsertIfMissingProps): Promise<boolean> {
  const adapter = assertDrizzleAdapter(getDatabase(req), 'Insert if missing');
  const tableName = adapter.tableNameMap?.get(toSnakeCase(collection));

  if (!tableName) {
    throw new Error(`[frogbot] Collection '${collection}' requires a SQL database adapter.`);
  }

  const table = adapter.tables[tableName];
  const fields = adapter.payload.collections[collection].config.flattenedFields;
  const now = new Date().toISOString();
  const columns = toColumns({ data: { createdAt: now, updatedAt: now, ...data }, fields });

  for (const key of [...Object.keys(columns), target]) {
    if (!(key in table)) {
      throw new Error(`[frogbot] '${collection}' inserts cannot write field '${key}'.`);
    }
  }

  const db = await sessionDatabase(adapter, req);

  const rows: unknown[] = is(db, PgDatabase)
    ? await db
        .insert(table)
        .values(columns)
        .onConflictDoNothing({ target: table[target] })
        .returning({ id: table.id })
    : await insertSQLite({ db, table, columns, target });

  adapter.lastWriteTimestamp = Date.now();

  return rows.length > 0;
}

async function insertSQLite({
  db,
  table,
  columns,
  target,
}: {
  db: Pick<BaseSQLiteDatabase<'async', unknown>, 'insert'>;
  table: SQLiteTable & Record<string, SQLiteColumn>;
  columns: Record<string, unknown>;
  target: string;
}): Promise<unknown[]> {
  return db
    .insert(table)
    .values(columns)
    .onConflictDoNothing({ target: table[target] })
    .returning({ id: table.id });
}

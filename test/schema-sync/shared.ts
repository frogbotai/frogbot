import { DatabaseSync } from 'node:sqlite';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import {
  buildConfig,
  type CollectionConfig,
  type SchemaSyncResult,
  type SyncSchema,
} from 'frogbot';

export type Field = NonNullable<CollectionConfig['fields']>[number];

type AfterSchemaInit = NonNullable<Parameters<typeof sqliteAdapter>[0]['afterSchemaInit']>[number];

/** `deals` with only `id` and `title`: code that gets past the sync's reconcile, as a hand-written hook can. */
export const dropDealColumns: AfterSchemaInit = ({ schema }) => ({
  ...schema,
  tables: {
    ...schema.tables,
    deals: sqliteTable('deals', {
      id: integer('id').primaryKey(),
      title: text('title'),
    }),
  },
});

/** Builds a fresh config on `db` (the sync takes over its adapter's `init`), then syncs it. */
export async function sync(
  db: string,
  collections: CollectionConfig[],
  adapter: Partial<Parameters<typeof sqliteAdapter>[0]> = {},
): Promise<SchemaSyncResult> {
  const config = await buildConfig({
    secret: 'schema-sync-test',
    db: sqliteAdapter({ client: { url: `file:${db}` }, ...adapter }),
    typescript: { autoGenerate: false },
    collections,
  });

  const { syncSchema } = (await config._internal.payloadConfig).db as { syncSchema?: SyncSchema };

  if (!syncSchema) throw new Error('syncSchema is unset');

  return syncSchema({ config });
}

/** Read-only: a read-write `node:sqlite` connection closing beside libSQL in one process fails libSQL's next connect. */
export function query<T = Record<string, unknown>>(db: string, sql: string): T[] {
  const conn = new DatabaseSync(db, { readOnly: true });

  try {
    return conn.prepare(sql).all() as T[];
  } finally {
    conn.close();
  }
}

export const count = (db: string, sql: string) => Number(Object.values(query(db, sql)[0])[0]);

export const columns = (db: string, table: string) =>
  query<{ name: string; notnull: number }>(db, `PRAGMA table_info(${table})`);

export const tables = (db: string) =>
  query<{ name: string }>(db, `SELECT name FROM sqlite_master WHERE type = 'table'`).map(
    ({ name }) => name,
  );

export const schemaDump = (db: string) =>
  query(db, `SELECT type, name, sql FROM sqlite_master ORDER BY name`);

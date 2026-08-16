import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  type SQLiteAdapter,
  sqliteAdapter as createSQLiteAdapter,
  type SQLiteAdapterArgs,
} from '@payloadcms/db-sqlite';

export { sql } from '@payloadcms/db-sqlite';
export type { MigrateDownArgs, MigrateUpArgs, SQLiteAdapter, SQLiteAdapterArgs };

export function sqliteAdapter(args: SQLiteAdapterArgs) {
  const adapter = createSQLiteAdapter(args);

  return {
    ...adapter,
    init(initArgs: Parameters<typeof adapter.init>[0]) {
      const database = adapter.init(initArgs);
      database.packageName = '@frogbotai/db-sqlite';
      return database;
    },
  };
}

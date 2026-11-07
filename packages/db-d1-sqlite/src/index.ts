import {
  type SQLiteAdapterArgs,
  sqliteD1Adapter as createSQLiteD1Adapter,
} from '@payloadcms/db-d1-sqlite';
import { sqliteAggregateAdapter } from 'frogbot/aggregate';
import { installSQLJobOperations } from 'frogbot/jobs';
import { sqliteD1SearchAdapter } from 'frogbot/search';

export type {
  MigrateDownArgs,
  MigrateUpArgs,
  SQLiteAdapter,
  SQLiteAdapterArgs,
} from '@payloadcms/db-d1-sqlite';
export { sql } from '@payloadcms/db-d1-sqlite';

export function sqliteD1Adapter(args: SQLiteAdapterArgs) {
  const adapter = createSQLiteD1Adapter(args);

  const prodMigrations: readonly unknown[] | null = args.prodMigrations ?? null;

  return {
    ...adapter,
    prodMigrations,
    init(initArgs: Parameters<typeof adapter.init>[0]) {
      const database = adapter.init(initArgs);

      database.packageName = '@frogbotai/db-d1-sqlite';

      installSQLJobOperations({ adapter: database, dialect: 'sqlite' });

      return database;
    },
    aggregate: sqliteAggregateAdapter,
    search: sqliteD1SearchAdapter,
  };
}

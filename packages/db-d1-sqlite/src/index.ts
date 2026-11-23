import {
  type MigrateDownArgs as PayloadMigrateDownArgs,
  type MigrateUpArgs as PayloadMigrateUpArgs,
  type SQLiteAdapterArgs,
  sqliteD1Adapter as createSQLiteD1Adapter,
} from '@payloadcms/db-d1-sqlite';
import type { MigrationArgs } from 'frogbot';
import { sqliteAggregateAdapter } from 'frogbot/aggregate';
import { installMigrateRefresh } from 'frogbot/internal';
import { installSQLJobOperations } from 'frogbot/jobs';
import { sqliteD1SearchAdapter } from 'frogbot/search';

export type { SQLiteAdapter, SQLiteAdapterArgs } from '@payloadcms/db-d1-sqlite';
export { sql } from '@payloadcms/db-d1-sqlite';

/** What a migration's `up` gets: `db`, the Drizzle instance inside the migration's transaction, and `req`. */
export type MigrateUpArgs = MigrationArgs<PayloadMigrateUpArgs>;

/** What a migration's `down` gets: `db`, the Drizzle instance inside the migration's transaction, and `req`. */
export type MigrateDownArgs = MigrationArgs<PayloadMigrateDownArgs>;

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

      installMigrateRefresh(database);

      return database;
    },
    aggregate: sqliteAggregateAdapter,
    search: sqliteD1SearchAdapter,
  };
}

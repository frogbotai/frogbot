import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  type SQLiteAdapter,
  sqliteAdapter as createSQLiteAdapter,
  type SQLiteAdapterArgs,
} from '@payloadcms/db-sqlite';
import { installSQLJobOperations } from 'frogbot/jobs';
import { sqliteSearchAdapter } from 'frogbot/search';

export { sql } from '@payloadcms/db-sqlite';
export type { MigrateDownArgs, MigrateUpArgs, SQLiteAdapter, SQLiteAdapterArgs };

export function sqliteAdapter(args: SQLiteAdapterArgs) {
  const adapter = createSQLiteAdapter({ ...args });

  return {
    ...adapter,
    init(initArgs: Parameters<typeof adapter.init>[0]) {
      const signIn = initArgs.payload.config?.collections.some(
        (collection) => collection.custom?.frogbot?.signIn?.length,
      );

      const database =
        signIn && args.transactionOptions === undefined
          ? createSQLiteAdapter({ ...args, transactionOptions: {} }).init(initArgs)
          : adapter.init(initArgs);

      database.packageName = '@frogbotai/db-sqlite';

      installSQLJobOperations({ adapter: database, dialect: 'sqlite' });

      return database;
    },
    search: sqliteSearchAdapter,
  };
}

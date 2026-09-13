import {
  type SQLiteAdapterArgs,
  sqliteD1Adapter as createSQLiteD1Adapter,
} from '@payloadcms/db-d1-sqlite';
import { installSQLJobOperations } from 'frogbot/jobs';

export type {
  MigrateDownArgs,
  MigrateUpArgs,
  SQLiteAdapter,
  SQLiteAdapterArgs,
} from '@payloadcms/db-d1-sqlite';

export function sqliteD1Adapter(args: SQLiteAdapterArgs) {
  const adapter = createSQLiteD1Adapter(args);

  return {
    ...adapter,
    init(initArgs: Parameters<typeof adapter.init>[0]) {
      const database = adapter.init(initArgs);

      installSQLJobOperations({ adapter: database, dialect: 'sqlite' });

      return database;
    },
  };
}

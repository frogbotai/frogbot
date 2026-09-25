import {
  postgresAdapter as createPostgresAdapter,
  type PostgresAdapterArgs,
} from '@payloadcms/db-postgres';
import { installSQLJobOperations } from 'frogbot/jobs';
import { postgresSearchAdapter } from 'frogbot/search';

export type {
  MigrateDownArgs,
  MigrateUpArgs,
  PostgresAdapter,
  PostgresAdapterArgs,
} from '@payloadcms/db-postgres';

export function postgresAdapter(args: PostgresAdapterArgs) {
  const adapter = createPostgresAdapter(args);

  return {
    ...adapter,
    init(initArgs: Parameters<typeof adapter.init>[0]) {
      const database = adapter.init(initArgs);

      installSQLJobOperations({ adapter: database, dialect: 'postgres' });

      return database;
    },
    search: postgresSearchAdapter,
  };
}

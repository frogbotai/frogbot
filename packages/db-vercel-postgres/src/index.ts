import {
  vercelPostgresAdapter as createVercelPostgresAdapter,
  type VercelPostgresAdapterArgs,
} from '@payloadcms/db-vercel-postgres';
import { postgresAggregateAdapter } from 'frogbot/aggregate';
import { installSQLJobOperations } from 'frogbot/jobs';
import { postgresSearchAdapter } from 'frogbot/search';

export type {
  MigrateDownArgs,
  MigrateUpArgs,
  VercelPostgresAdapter,
  VercelPostgresAdapterArgs,
} from '@payloadcms/db-vercel-postgres';

export function vercelPostgresAdapter(args: VercelPostgresAdapterArgs) {
  const adapter = createVercelPostgresAdapter(args);

  const prodMigrations: readonly unknown[] | null = args.prodMigrations ?? null;

  return {
    ...adapter,
    prodMigrations,
    init(initArgs: Parameters<typeof adapter.init>[0]) {
      const database = adapter.init(initArgs);

      installSQLJobOperations({ adapter: database, dialect: 'postgres' });

      return database;
    },
    aggregate: postgresAggregateAdapter,
    search: postgresSearchAdapter,
  };
}

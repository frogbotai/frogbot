import {
  type MigrateDownArgs as PayloadMigrateDownArgs,
  type MigrateUpArgs as PayloadMigrateUpArgs,
  vercelPostgresAdapter as createVercelPostgresAdapter,
  type VercelPostgresAdapterArgs,
} from '@payloadcms/db-vercel-postgres';
import type { MigrationArgs } from 'frogbot';
import { postgresAggregateAdapter } from 'frogbot/aggregate';
import { installMigrateRefresh } from 'frogbot/internal';
import { installSQLJobOperations } from 'frogbot/jobs';
import { postgresSearchAdapter } from 'frogbot/search';

export type {
  VercelPostgresAdapter,
  VercelPostgresAdapterArgs,
} from '@payloadcms/db-vercel-postgres';
export { sql } from '@payloadcms/db-vercel-postgres';

/** What a migration's `up` gets: `db`, the Drizzle instance inside the migration's transaction, and `req`. */
export type MigrateUpArgs = MigrationArgs<PayloadMigrateUpArgs>;

/** What a migration's `down` gets: `db`, the Drizzle instance inside the migration's transaction, and `req`. */
export type MigrateDownArgs = MigrationArgs<PayloadMigrateDownArgs>;

export function vercelPostgresAdapter(args: VercelPostgresAdapterArgs) {
  const adapter = createVercelPostgresAdapter(args);

  const prodMigrations: readonly unknown[] | null = args.prodMigrations ?? null;

  return {
    ...adapter,
    prodMigrations,
    init(initArgs: Parameters<typeof adapter.init>[0]) {
      const database = adapter.init(initArgs);

      installSQLJobOperations({ adapter: database, dialect: 'postgres' });

      installMigrateRefresh(database);

      return database;
    },
    aggregate: postgresAggregateAdapter,
    search: postgresSearchAdapter,
    url: args.pool?.connectionString ?? process.env.POSTGRES_URL,
  };
}

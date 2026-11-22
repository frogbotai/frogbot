import {
  type MigrateDownArgs as PayloadMigrateDownArgs,
  type MigrateUpArgs as PayloadMigrateUpArgs,
  postgresAdapter as createPostgresAdapter,
  type PostgresAdapterArgs,
} from '@payloadcms/db-postgres';
import type { MigrationArgs } from 'frogbot';
import { postgresAggregateAdapter } from 'frogbot/aggregate';
import { installSQLJobOperations } from 'frogbot/jobs';
import { postgresSearchAdapter } from 'frogbot/search';

import { syncSchema } from './schema/sync.js';

export type { PostgresAdapter, PostgresAdapterArgs } from '@payloadcms/db-postgres';
export { sql } from '@payloadcms/db-postgres';

/** What a migration's `up` gets: `db`, the Drizzle instance inside the migration's transaction, and `req`. */
export type MigrateUpArgs = MigrationArgs<PayloadMigrateUpArgs>;

/** What a migration's `down` gets: `db`, the Drizzle instance inside the migration's transaction, and `req`. */
export type MigrateDownArgs = MigrationArgs<PayloadMigrateDownArgs>;

/**
 * Payload's Postgres adapter with FrogBot's job operations. Without `prodMigrations`, it also syncs the
 * schema for `frogbot up`: it adds tables, columns and indexes, never drops data and never asks.
 */
export function postgresAdapter(args: PostgresAdapterArgs) {
  const adapter = createPostgresAdapter(args);

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
    url: poolUrl(args.pool),
    ...(args.prodMigrations === undefined && { syncSchema }),
  };
}

function poolUrl(pool: PostgresAdapterArgs['pool']): string | undefined {
  if (pool.connectionString) return pool.connectionString;
  if (!pool.host) return undefined;

  return `postgres://${pool.host}${pool.port ? `:${String(pool.port)}` : ''}/${pool.database ?? ''}`;
}

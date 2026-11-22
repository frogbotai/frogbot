import {
  postgresAdapter as createPostgresAdapter,
  type PostgresAdapterArgs,
} from '@payloadcms/db-postgres';
import { postgresAggregateAdapter } from 'frogbot/aggregate';
import { installSQLJobOperations } from 'frogbot/jobs';
import { postgresSearchAdapter } from 'frogbot/search';

import { syncSchema } from './schema/sync.js';

export type {
  MigrateDownArgs,
  MigrateUpArgs,
  PostgresAdapter,
  PostgresAdapterArgs,
} from '@payloadcms/db-postgres';

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

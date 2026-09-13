import {
  vercelPostgresAdapter as createVercelPostgresAdapter,
  type VercelPostgresAdapterArgs,
} from '@payloadcms/db-vercel-postgres';
import { installSQLJobOperations } from 'frogbot/jobs';

export type {
  MigrateDownArgs,
  MigrateUpArgs,
  VercelPostgresAdapter,
  VercelPostgresAdapterArgs,
} from '@payloadcms/db-vercel-postgres';

export function vercelPostgresAdapter(args: VercelPostgresAdapterArgs) {
  const adapter = createVercelPostgresAdapter(args);

  return {
    ...adapter,
    init(initArgs: Parameters<typeof adapter.init>[0]) {
      const database = adapter.init(initArgs);

      installSQLJobOperations({ adapter: database, dialect: 'postgres' });

      return database;
    },
  };
}

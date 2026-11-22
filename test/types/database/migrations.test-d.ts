import type * as mongodb from '@frogbotai/db-mongodb';
import { migrationDatabase } from '@frogbotai/db-mongodb';
import type * as postgres from '@frogbotai/db-postgres';
import { postgresAdapter } from '@frogbotai/db-postgres';
import type * as sqlite from '@frogbotai/db-sqlite';
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { MigrationRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

expectTypeOf<keyof sqlite.MigrateUpArgs>().toEqualTypeOf<'db' | 'req'>();
expectTypeOf<keyof sqlite.MigrateDownArgs>().toEqualTypeOf<'db' | 'req'>();
expectTypeOf<keyof postgres.MigrateUpArgs>().toEqualTypeOf<'db' | 'req'>();
expectTypeOf<keyof postgres.MigrateDownArgs>().toEqualTypeOf<'db' | 'req'>();
expectTypeOf<keyof mongodb.MigrateUpArgs>().toEqualTypeOf<'req'>();
expectTypeOf<keyof mongodb.MigrateDownArgs>().toEqualTypeOf<'req'>();
expectTypeOf<sqlite.MigrateUpArgs['req']>().toEqualTypeOf<MigrationRequest>();
expectTypeOf<MigrationRequest>().not.toHaveProperty('frogbot');
expectTypeOf<MigrationRequest>().not.toHaveProperty('payload');

// @ts-expect-error migrations get no `payload`
export const up = ({ payload }: sqlite.MigrateUpArgs): Promise<void> => Promise.resolve(payload);

const sqliteMigration = {
  name: '20260101_000000_init',
  up: ({ db, req }: sqlite.MigrateUpArgs) => Promise.resolve(void [db, req]),
  down: ({ db, req }: sqlite.MigrateDownArgs) => Promise.resolve(void [db, req]),
};

const postgresMigration = {
  name: '20260101_000000_init',
  up: ({ db, req }: postgres.MigrateUpArgs) => Promise.resolve(void [db, req]),
  down: ({ db, req }: postgres.MigrateDownArgs) => Promise.resolve(void [db, req]),
};

sqliteAdapter({ client: { url: 'file:./app.db' }, prodMigrations: [sqliteMigration] });
postgresAdapter({ pool: { connectionString: '' }, prodMigrations: [postgresMigration] });

export const mongoUp = async ({ req }: mongodb.MigrateUpArgs): Promise<void> => {
  const { db, session } = await migrationDatabase(req);

  await db
    .collection('posts')
    .updateMany({ summary: { $exists: false } }, { $set: { summary: '' } }, { session });
};

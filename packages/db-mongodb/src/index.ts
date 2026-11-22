import type {
  Args,
  MigrateDownArgs as PayloadMigrateDownArgs,
  MigrateUpArgs as PayloadMigrateUpArgs,
  MongooseAdapter,
} from '@payloadcms/db-mongodb';
import { mongooseAdapter as createMongooseAdapter } from '@payloadcms/db-mongodb';
import type { MigrationArgs, MigrationRequest } from 'frogbot';
import type { AggregateAdapter } from 'frogbot/aggregate';
import { migrationPayloadRequest } from 'frogbot/internal';
import type { JobLogDatabase } from 'frogbot/jobs';
import { jobLogOperations } from 'frogbot/jobs';
import type { SearchAdapter } from 'frogbot/search';

import { mongooseAggregateAdapter } from './aggregate/index.js';
import { installPartialCompoundIndexes } from './compoundIndexes.js';
import { installJobIndexes } from './jobIndexes.js';
import { pruneJobLogs } from './jobLogs.js';
import { mongooseSearchAdapter } from './search/index.js';
import { createUpdateJobs } from './updateJobs.js';

export type { Args, MongooseAdapter } from '@payloadcms/db-mongodb';
export { compatibilityOptions } from '@payloadcms/db-mongodb';

/** What a migration's `up` gets: `req`. `migrationDatabase(req)` returns the database and the transaction's session. */
export type MigrateUpArgs = MigrationArgs<PayloadMigrateUpArgs>;

/** What a migration's `down` gets: `req`. `migrationDatabase(req)` returns the database and the transaction's session. */
export type MigrateDownArgs = MigrationArgs<PayloadMigrateDownArgs>;

/** The MongoDB database a migration changes, and the session of its transaction when there is one. */
export type MigrationDatabase = {
  db: NonNullable<MongooseAdapter['connection']['db']>;
  session?: MongooseAdapter['sessions'][string];
};

/**
 * The database a migration changes, from its `req`: `const { db, session } = await migrationDatabase(req)`.
 * Pass `session` to each call so the change joins the migration's transaction when there is one.
 */
export async function migrationDatabase(req: MigrationRequest): Promise<MigrationDatabase> {
  const { db: adapter } = migrationPayloadRequest(req).payload;
  const mongoose = adapter.name === 'mongoose' ? (adapter as MongooseAdapter) : undefined;
  const db = mongoose?.connection?.db;

  if (!mongoose || !db) {
    throw new Error('[frogbot] migrationDatabase needs a connected MongoDB adapter.');
  }

  const transactionID = await req.transactionID;
  const session = transactionID === undefined ? undefined : mongoose.sessions[transactionID];

  return session ? { db, session } : { db };
}

export const mongooseAdapter = (
  args: Args,
): ReturnType<typeof createMongooseAdapter> & {
  aggregate: AggregateAdapter;
  search: SearchAdapter;
} => {
  const { init, ...adapter } = createMongooseAdapter(args);

  return {
    ...adapter,
    aggregate: mongooseAggregateAdapter,
    search: mongooseSearchAdapter,
    init(initArgs) {
      const database = init(initArgs) as MongooseAdapter &
        Pick<JobLogDatabase, typeof jobLogOperations>;

      database.packageName = '@frogbotai/db-mongodb';

      const { connect } = database;

      database.connect = async (...connectArgs) => {
        await connect?.call(database, ...connectArgs);
        await awaitModels(database);
      };

      installJobIndexes(database);
      installPartialCompoundIndexes(database);

      database.updateJobs = createUpdateJobs(database);

      database[jobLogOperations] = {
        prune: (args) => pruneJobLogs({ adapter: database, ...args }),
      };

      return database;
    },
  };
};

const awaitModels = async (database: MongooseAdapter): Promise<void> => {
  if (database.url === false) return;

  await Promise.all(
    Object.entries(database.connection.models).map(async ([slug, model]) => {
      try {
        await model.init();
      } catch (error) {
        throw new Error(
          `Could not create the collection or indexes for "${slug}": ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    }),
  );
};

import type { MongooseAdapter } from '@payloadcms/db-mongodb';
import { mongooseAdapter as createMongooseAdapter } from '@payloadcms/db-mongodb';
import type { JobLeaseDatabase } from 'frogbot/jobs';
import { jobLeaseOperations } from 'frogbot/jobs';

import { updateJobLeases } from './updateJobLeases.js';
import { createUpdateJobs } from './updateJobs.js';

export type { Args, MigrateDownArgs, MigrateUpArgs, MongooseAdapter } from '@payloadcms/db-mongodb';

export const mongooseAdapter: typeof createMongooseAdapter = (args) => {
  const { init, ...adapter } = createMongooseAdapter(args);

  return {
    ...adapter,
    init(initArgs) {
      const database = init(initArgs) as MongooseAdapter &
        Pick<JobLeaseDatabase, typeof jobLeaseOperations>;

      database.packageName = '@frogbotai/db-mongodb';

      database.updateJobs = createUpdateJobs(database);

      database[jobLeaseOperations] = {
        update: (args) => updateJobLeases({ adapter: database, ...args }),
      };

      return database;
    },
  };
};

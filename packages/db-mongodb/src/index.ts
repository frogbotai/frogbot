import type { Args, MongooseAdapter } from '@payloadcms/db-mongodb';
import { mongooseAdapter as createMongooseAdapter } from '@payloadcms/db-mongodb';
import type { JobLeaseDatabase, JobLogDatabase } from 'frogbot/jobs';
import { jobLeaseOperations, jobLogOperations } from 'frogbot/jobs';
import type { SearchAdapter } from 'frogbot/search';

import { installJobIndexes } from './jobIndexes.js';
import { pruneJobLogs } from './jobLogs.js';
import { mongooseSearchAdapter } from './search/index.js';
import { updateJobLeases } from './updateJobLeases.js';
import { createUpdateJobs } from './updateJobs.js';

export type { Args, MigrateDownArgs, MigrateUpArgs, MongooseAdapter } from '@payloadcms/db-mongodb';
export { compatibilityOptions } from '@payloadcms/db-mongodb';

export const mongooseAdapter = (
  args: Args,
): ReturnType<typeof createMongooseAdapter> & { search: SearchAdapter } => {
  const { init, ...adapter } = createMongooseAdapter(args);

  return {
    ...adapter,
    search: mongooseSearchAdapter,
    init(initArgs) {
      const database = init(initArgs) as MongooseAdapter &
        Pick<JobLeaseDatabase, typeof jobLeaseOperations> &
        Pick<JobLogDatabase, typeof jobLogOperations>;

      database.packageName = '@frogbotai/db-mongodb';

      installJobIndexes(database);

      database.updateJobs = createUpdateJobs(database);

      database[jobLeaseOperations] = {
        update: (args) => updateJobLeases({ adapter: database, ...args }),
      };

      database[jobLogOperations] = {
        prune: (args) => pruneJobLogs({ adapter: database, ...args }),
      };

      return database;
    },
  };
};

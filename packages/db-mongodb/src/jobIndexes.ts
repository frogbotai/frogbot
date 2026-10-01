import type { MongooseAdapter } from '@payloadcms/db-mongodb';

import { getJobModel } from './jobModel.js';

export function installJobIndexes(database: MongooseAdapter) {
  const create = database.create;
  const connect = database.connect!;

  database.create = async (args) => {
    if (args.collection !== 'payload-jobs') return create.call(database, args);

    return create.call(database, {
      ...args,
      data: { ...args.data, completedAt: args.data.completedAt ?? null },
    });
  };

  database.connect = async (options) => {
    await connect.call(database, options);

    if (!database.connection || !database.collections['payload-jobs']) return;

    const { Model } = getJobModel(database);

    await Model.collection.createIndex(
      { jobId: 1 },
      {
        name: 'frogbot_jobId_live',
        unique: true,
        partialFilterExpression: {
          jobId: { $type: 'string' },
          completedAt: { $type: 'null' },
          hasError: false,
        },
      },
    );
  };
}

import type { MongooseAdapter } from '@payloadcms/db-mongodb';
import type { JobLogOperations } from 'frogbot/jobs';

import { getJobModel, getJobSession } from './jobModel.js';

export async function pruneJobLogs({
  adapter,
  id,
  keep,
  req,
}: Parameters<JobLogOperations['prune']>[0] & { adapter: MongooseAdapter }): Promise<void> {
  const { Model } = getJobModel(adapter);

  const query = await Model.buildQuery({
    payload: adapter.payload,
    where: { id: { equals: id } },
  });

  const session = await getJobSession({ adapter, req });

  await Model.updateOne(
    { $and: [query, { completedAt: null }, { hasError: { $ne: true } }] },
    { $pull: { log: { id: { $nin: keep } } } },
    { session, timestamps: false },
  );
}

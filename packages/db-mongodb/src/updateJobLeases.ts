import type { MongooseAdapter } from '@payloadcms/db-mongodb';
import type { JobLeaseMutation } from 'frogbot/jobs';

import { getJobModel, getJobSession, transformJobUpdate } from './jobModel.js';

export async function updateJobLeases({
  adapter,
  data,
  req,
  where,
}: JobLeaseMutation & { adapter: MongooseAdapter }): Promise<void> {
  if (req.payload !== adapter.payload) {
    throw new Error('FrogBot job lease updates require a request for this runtime.');
  }

  const { Model } = getJobModel(adapter);

  const query = await Model.buildQuery({ payload: adapter.payload, where });

  const update = transformJobUpdate({ adapter, data: { ...data } });

  const session = await getJobSession({ adapter, req });

  await Model.updateMany(query, update, { session, timestamps: false });
}

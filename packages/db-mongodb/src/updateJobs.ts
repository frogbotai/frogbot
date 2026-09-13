import type { MongooseAdapter } from '@payloadcms/db-mongodb';
import { transform } from '@payloadcms/db-mongodb/internal';
import { getJobClaimFields, getJobLeaseContext, recordJobClaims } from 'frogbot/jobs';

import { getJobModel, getJobSession, transformJobUpdate } from './jobModel.js';

type MongoJob = NonNullable<Awaited<ReturnType<MongooseAdapter['updateJobs']>>>[number];

export function createUpdateJobs(adapter: MongooseAdapter): MongooseAdapter['updateJobs'] {
  const updateJobs = adapter.updateJobs;

  return async (args) => {
    if (args.data.processing !== true) return updateJobs.call(adapter, args);

    const context = getJobLeaseContext();

    if (!context || context.payload !== adapter.payload) {
      throw new Error('FrogBot job claims require an active jobs run for this runtime.');
    }

    const { id, limit, req, returning, sort } = args;
    const { fields, Model } = getJobModel(adapter);

    const where = {
      and: [
        args.where ?? {},
        ...(id !== undefined ? [{ id: { equals: id } }] : []),
        { processing: { equals: false } },
      ],
    };

    const query = await Model.buildQuery({ payload: adapter.payload, where });

    const session = await getJobSession({ adapter, req });

    const candidates =
      id !== undefined
        ? [{ id }]
        : (
            await adapter.find({
              collection: 'payload-jobs',
              where,
              sort,
              limit: typeof limit === 'number' && limit > 0 ? limit : 0,
              pagination: false,
              select: { id: true },
              req,
            })
          ).docs;

    const data = { ...args.data };

    if (
      !(Array.isArray(data.log) && data.log.length) &&
      !(data.log && typeof data.log === 'object' && '$push' in data.log)
    ) {
      delete data.log;
    }

    const update = transformJobUpdate({ adapter, data });

    const result: MongoJob[] = [];

    for (const candidate of candidates) {
      const candidateQuery = await Model.buildQuery({
        payload: adapter.payload,
        where: { id: { equals: candidate.id } },
      });

      const doc = await Model.findOneAndUpdate(
        { $and: [query, candidateQuery] },
        { ...update, $set: { ...update.$set, ...getJobClaimFields() } },
        { session, timestamps: false, new: true },
      ).lean<MongoJob | null>();

      if (!doc) continue;

      transform({ adapter, data: doc, fields, operation: 'read' });

      recordJobClaims([doc.id]);

      result.push(doc);
    }

    return returning === false ? null : result;
  };
}

import type { MongooseAdapter } from '@payloadcms/db-mongodb';
import { transform } from '@payloadcms/db-mongodb/internal';
import { isJobClaim, unleased, yieldHeldKeys } from 'frogbot/jobs';

import { getJobModel, getJobSession, transformJobUpdate } from './jobModel.js';

type MongoJob = NonNullable<Awaited<ReturnType<MongooseAdapter['updateJobs']>>>[number];

export function createUpdateJobs(adapter: MongooseAdapter): MongooseAdapter['updateJobs'] {
  const updateJobs = adapter.updateJobs;

  return async (args) => {
    if (!isJobClaim(args.data)) return updateJobs.call(adapter, args);

    const { id, limit, req, returning, sort } = args;
    const { fields, Model } = getJobModel(adapter);

    const where = {
      and: [
        args.where ?? {},
        ...(id !== undefined ? [{ id: { equals: id } }] : []),
        unleased(new Date().toISOString()),
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

    const update = transformJobUpdate({ adapter, data: { ...args.data } });

    const claimed: MongoJob[] = [];

    for (const candidate of candidates) {
      const candidateQuery = await Model.buildQuery({
        payload: adapter.payload,
        where: { id: { equals: candidate.id } },
      });

      const doc = await Model.findOneAndUpdate({ $and: [query, candidateQuery] }, update, {
        session,
        timestamps: false,
        new: true,
      }).lean<MongoJob | null>();

      if (!doc) continue;

      transform({ adapter, data: doc, fields, operation: 'read' });

      claimed.push(doc);
    }

    const result = await yieldHeldKeys({
      find: (findArgs) => adapter.find(findArgs),
      rows: claimed,
      processingToken: args.data.processingToken,
      release: (release) => updateJobs.call(adapter, { ...release, req, returning: false }),
    });

    return returning === false ? null : result;
  };
}

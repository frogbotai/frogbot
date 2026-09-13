import type { MongooseAdapter } from '@payloadcms/db-mongodb';
import { transform } from '@payloadcms/db-mongodb/internal';

export function getJobModel(adapter: MongooseAdapter) {
  const collection = adapter.payload.collections['payload-jobs'];
  const Model = adapter.collections['payload-jobs'];

  if (!collection || !Model) throw new Error('FrogBot jobs collection is not initialized.');

  return { fields: collection.config.fields, Model };
}

export async function getJobSession({
  adapter,
  req,
}: {
  adapter: MongooseAdapter;
  req: Parameters<MongooseAdapter['updateJobs']>[0]['req'];
}): Promise<MongooseAdapter['sessions'][number | string] | undefined> {
  const transactionID = await req?.transactionID;

  if (!transactionID) return;

  const session = adapter.sessions[transactionID];

  if (session && !session.inTransaction()) {
    delete adapter.sessions[transactionID];

    return;
  }

  return session;
}

export function transformJobUpdate({
  adapter,
  data,
}: {
  adapter: MongooseAdapter;
  data: Record<string, unknown>;
}) {
  const { fields } = getJobModel(adapter);
  const $inc: Record<string, number> = {};
  const $push: Record<string, unknown> = {};
  const $addToSet: Record<string, unknown> = {};
  const $pull: Record<string, unknown> = {};

  transform({ adapter, data, fields, operation: 'write', $inc, $push, $addToSet, $pull });

  const update: Record<string, Record<string, unknown>> = { $set: data };

  for (const [operator, values] of Object.entries({ $inc, $push, $addToSet, $pull })) {
    if (Object.keys(values).length) update[operator] = values;
  }

  return update;
}

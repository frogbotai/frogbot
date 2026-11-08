import type { MongooseAdapter } from '@payloadcms/db-mongodb';
import type { AdapterAggregate, AggregateSortDescriptor } from 'frogbot/aggregate';

import { getJobSession } from '../jobModel.js';
import { resolvePath } from './resolvePath.js';

type Stage = Record<string, unknown>;

type GroupedRow = { _id: Record<string, unknown> } & Record<string, unknown>;

const groupKey = (index: number) => `k${index}`;

const valueKey = (index: number) => `v${index}`;

function sortField({ index, target }: AggregateSortDescriptor): string {
  return target === 'group' ? `_id.${groupKey(index)}` : valueKey(index);
}

function isMongooseAdapter(db: unknown): db is MongooseAdapter {
  return typeof db === 'object' && db !== null && 'name' in db && db.name === 'mongoose';
}

function toKey(value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    '_bsontype' in value &&
    value._bsontype === 'ObjectId'
  ) {
    return String(value);
  }

  return value ?? null;
}

/**
 * Groups in four steps: match the documents, unwind each group path into its own field, keep one
 * row per document and key, then total those rows. So a document counts once per group whatever
 * the unwinds and lookups multiply.
 */
export const aggregate: AdapterAggregate = async ({
  collection,
  db,
  groupBy,
  limit,
  locale: requestedLocale,
  page,
  req,
  sort,
  values,
  where,
}) => {
  const adapter: unknown = db;

  if (!isMongooseAdapter(adapter)) {
    throw new Error('[frogbot] Aggregate requires a MongoDB database connection.');
  }

  const Model = adapter.collections[collection];
  const { localization } = adapter.payload.config;
  const locale = localization ? (requestedLocale ?? localization.defaultLocale) : undefined;

  const match = await Model.buildQuery({ locale, payload: adapter.payload, where });
  const pipeline: Stage[] = [{ $match: match }];
  const keys: Record<string, unknown> = { document: '$_id' };

  for (const [index, { by, path }] of groupBy.entries()) {
    const resolved = resolvePath({
      adapter,
      alias: `__frogbot_g${index}`,
      collection,
      locale,
      path,
    });

    pipeline.push(...resolved.stages);

    const field = { $ifNull: [`$${resolved.path}`, null] };

    keys[groupKey(index)] = by
      ? { $dateTrunc: { date: field, unit: by, timezone: 'UTC', startOfWeek: 'monday' } }
      : field;
  }

  const perDocument: Record<string, unknown> = { _id: keys };
  const totals: Record<string, unknown> = {
    _id: Object.fromEntries(
      groupBy.map((_, index) => [groupKey(index), `$_id.${groupKey(index)}`]),
    ),
  };

  for (const [index, value] of values.entries()) {
    if (value.operation === 'count') {
      totals[valueKey(index)] = { $sum: 1 };

      continue;
    }

    const { path } = resolvePath({
      adapter,
      alias: '__frogbot_v',
      collection,
      locale,
      path: value.path,
    });

    perDocument[valueKey(index)] = { $first: `$${path}` };
    totals[valueKey(index)] = { [`$${value.operation}`]: `$${valueKey(index)}` };
  }

  const nullsLast: Record<string, unknown> = {};
  const order: Record<string, 1 | -1> = {};

  for (const [index, descriptor] of sort.entries()) {
    nullsLast[`n${index}`] = {
      $cond: [{ $eq: [{ $ifNull: [`$${sortField(descriptor)}`, null] }, null] }, 1, 0],
    };

    order[`n${index}`] = 1;
    order[sortField(descriptor)] = descriptor.direction === 'asc' ? 1 : -1;
  }

  pipeline.push({ $group: perDocument }, { $group: totals });

  if (sort.length) pipeline.push({ $addFields: nullsLast }, { $sort: order });

  if (limit) {
    pipeline.push({
      $facet: {
        rows: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    });
  }

  const session = await getJobSession({ adapter, req });
  const result = await Model.collection.aggregate(pipeline, { session }).toArray();

  const [facet] = (limit ? result : [{ rows: result, total: [{ count: result.length }] }]) as {
    rows: GroupedRow[];
    total: { count: number }[];
  }[];

  return {
    rows: facet.rows.map((row) => ({
      group: groupBy.map((_, index) => toKey(row._id[groupKey(index)])),
      values: values.map((_, index) => row[valueKey(index)] ?? null),
    })),
    totalDocs: facet.total[0]?.count ?? 0,
  };
};

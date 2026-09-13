import {
  buildQuery,
  type DrizzleAdapter,
  type GenericColumn,
  type GenericTable,
} from '@payloadcms/drizzle';
import type { SQL } from 'drizzle-orm';
import type { PayloadRequest, Where } from 'payload';

import { WAITPOINTS_SLUG } from './collection.js';
import type { Waitpoint } from './types.js';

type WaitpointSQLWriter = {
  update: (table: GenericTable) => {
    set: (data: Record<string, unknown>) => {
      where: (where: SQL | undefined) => {
        returning: (fields: { id: GenericColumn }) => PromiseLike<{ id: number | string }[]>;
      };
    };
  };
};

export async function updateWaitpoint({
  req,
  where,
  data,
}: {
  req: PayloadRequest;
  where: Where;
  data: Partial<Omit<Waitpoint, 'id'>>;
}): Promise<boolean> {
  const database = req.payload.db;
  const update = { ...data, updatedAt: new Date().toISOString() };

  if (
    database.packageName === '@frogbotai/db-mongodb' ||
    database.packageName === '@payloadcms/db-mongodb'
  ) {
    const result = await database.updateOne({
      collection: WAITPOINTS_SLUG,
      where,
      data: update,
      req,
      returning: true,
    });

    return result !== null;
  }

  const adapter = database as unknown as DrizzleAdapter;
  const tableName = adapter.tableNameMap?.get('frogbot_waitpoints');

  if (!tableName) throw new Error('FrogBot waitpoints require an atomic database adapter.');

  const table = adapter.tables[tableName];
  const collection = req.payload.collections[WAITPOINTS_SLUG].config;
  const query = buildQuery({
    adapter,
    tableName,
    fields: collection.flattenedFields,
    where,
  });

  if (query.joins.length) {
    throw new Error('FrogBot waitpoint predicates must use waitpoint fields.');
  }

  for (const key of Object.keys(update)) {
    if (!(key in table)) throw new Error(`FrogBot waitpoints cannot update nested field '${key}'.`);
  }

  const transactionID = await req.transactionID;
  const db =
    (transactionID && adapter.sessions[transactionID]?.db) ||
    adapter.primaryDrizzle ||
    adapter.drizzle;

  const rows = await (db as unknown as WaitpointSQLWriter)
    .update(table)
    .set(update)
    .where(query.where)
    .returning({ id: table.id });

  adapter.lastWriteTimestamp = Date.now();

  return rows.length > 0;
}

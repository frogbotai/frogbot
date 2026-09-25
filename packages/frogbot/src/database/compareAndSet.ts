import {
  buildQuery,
  type DrizzleAdapter,
  type GenericColumn,
  type GenericTable,
} from '@payloadcms/drizzle';
import type { SQL } from 'drizzle-orm';
import type { DatabaseAdapter, FlattenedField, PayloadRequest, Where } from 'payload';
import toSnakeCase from 'to-snake-case';

import type { DocID } from '../collections/config/types.js';
import type { FrogBotRequest } from '../types/request.js';

export type CompareAndSetProps = {
  req: FrogBotRequest | PayloadRequest;
  collection: string;
  where: Where;
  data: Record<string, unknown>;
};

export type UpdateIfVersionProps = {
  req: FrogBotRequest | PayloadRequest;
  collection: string;
  id: DocID;
  version: number;
  data: Record<string, unknown>;
};

type SQLWriter = {
  update: (table: GenericTable) => {
    set: (data: Record<string, unknown>) => {
      where: (where: SQL | undefined) => {
        returning: (fields: { id: GenericColumn }) => PromiseLike<{ id: DocID }[]>;
      };
    };
  };
};

const MONGO_PACKAGES = new Set(['@frogbotai/db-mongodb', '@payloadcms/db-mongodb']);

export async function compareAndSet({
  req,
  collection,
  where,
  data,
}: CompareAndSetProps): Promise<boolean> {
  const database = getDatabase(req);
  const update = { ...data, updatedAt: new Date().toISOString() };

  if (MONGO_PACKAGES.has(database.packageName)) {
    const result = await database.updateOne({
      collection,
      where,
      data: withoutUndefined(update),
      req: req as PayloadRequest,
      returning: true,
    });

    return result !== null;
  }

  const adapter = database as unknown as DrizzleAdapter;
  const tableName = adapter.tableNameMap?.get(toSnakeCase(collection));

  if (!tableName) {
    throw new Error(`[frogbot] Collection '${collection}' requires an atomic database adapter.`);
  }

  const table = adapter.tables[tableName];
  const fields = adapter.payload.collections[collection]!.config.flattenedFields;
  const query = buildQuery({ adapter, tableName, fields, where });

  if (query.joins.length) {
    throw new Error(`[frogbot] Atomic '${collection}' predicates must use top-level fields.`);
  }

  const columns = toColumns({ data: update, fields });

  for (const key of Object.keys(columns)) {
    if (!(key in table)) {
      throw new Error(`[frogbot] Atomic '${collection}' updates cannot write field '${key}'.`);
    }
  }

  const transactionID = await req.transactionID;
  const db =
    (transactionID && adapter.sessions[transactionID]?.db) ||
    adapter.primaryDrizzle ||
    adapter.drizzle;

  const rows = await (db as unknown as SQLWriter)
    .update(table)
    .set(columns)
    .where(query.where)
    .returning({ id: table.id });

  adapter.lastWriteTimestamp = Date.now();

  return rows.length > 0;
}

export async function updateIfVersion({
  req,
  collection,
  id,
  version,
  data,
}: UpdateIfVersionProps): Promise<boolean> {
  return compareAndSet({
    req,
    collection,
    where: { and: [{ id: { equals: id } }, { version: { equals: version } }] },
    data: { ...data, version: version + 1 },
  });
}

function getDatabase(req: FrogBotRequest | PayloadRequest): DatabaseAdapter {
  return 'frogbot' in req ? req.frogbot.db : req.payload.db;
}

function toColumns({
  data,
  fields,
}: {
  data: Record<string, unknown>;
  fields: FlattenedField[];
}): Record<string, unknown> {
  const columns: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(data)) {
    const field = fields.find((candidate) => candidate.name === name);

    if (field?.type !== 'group' || value === null || typeof value !== 'object') {
      columns[name] = value;

      continue;
    }

    for (const [subfield, subvalue] of Object.entries(value)) {
      columns[`${name}_${subfield}`] = subvalue;
    }
  }

  return columns;
}

function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutUndefined) as T;

  if (value === null || typeof value !== 'object' || value.constructor !== Object) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, withoutUndefined(entry)]),
  ) as T;
}

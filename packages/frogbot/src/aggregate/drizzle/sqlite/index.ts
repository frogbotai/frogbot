import { is, type SQL, sql } from 'drizzle-orm';
import { BaseSQLiteDatabase, QueryBuilder, type SQLiteTable } from 'drizzle-orm/sqlite-core';

import type { AggregateAdapter } from '../../../database/types.js';
import type { AggregateDateUnit } from '../../types.js';
import {
  type AggregateDialect,
  type AggregateSelect,
  type AggregateSelectQuery,
  createDrizzleAggregate,
} from '../buildAggregateQuery.js';

function bucket(column: SQL, unit: AggregateDateUnit): SQL {
  switch (unit) {
    case 'day':
      return sql`strftime('%Y-%m-%dT00:00:00.000Z', ${column})`;
    case 'week':
      return sql`strftime('%Y-%m-%dT00:00:00.000Z', ${column}, 'weekday 0', '-6 days')`;
    case 'month':
      return sql`strftime('%Y-%m-01T00:00:00.000Z', ${column})`;
    case 'quarter':
      return sql`(strftime('%Y-', ${column}) || printf('%02d', ((cast(strftime('%m', ${column}) as integer) - 1) / 3) * 3 + 1) || '-01T00:00:00.000Z')`;
    case 'year':
      return sql`strftime('%Y-01-01T00:00:00.000Z', ${column})`;
  }
}

function select({
  distinct,
  fields,
  from,
  groupBy = [],
  joins = [],
  limit,
  offset,
  orderBy = [],
  where,
}: AggregateSelect): AggregateSelectQuery {
  const builder = new QueryBuilder();

  let query = (distinct ? builder.selectDistinct(fields) : builder.select(fields))
    .from(from as SQLiteTable)
    .$dynamic();

  for (const join of joins) {
    query = query[join.type ?? 'leftJoin'](join.table as SQLiteTable, join.condition);
  }

  query = query.where(where);

  if (groupBy.length) query = query.groupBy(...groupBy);

  if (orderBy.length) query = query.orderBy(...orderBy);

  if (limit) query = query.limit(limit).offset(offset ?? 0);

  return query;
}

const dialect: AggregateDialect = {
  bucket,
  text: (column) => column,
  select,
  async run({ adapter, query, req }) {
    const transactionID = await req.transactionID;
    const db = (transactionID && adapter.sessions[transactionID]?.db) || adapter.drizzle;

    if (!is(db, BaseSQLiteDatabase)) {
      throw new Error('[frogbot] Aggregate requires a SQLite database connection.');
    }

    return db.all<Record<string, unknown>>(query.getSQL());
  },
};

export const sqliteAggregateAdapter: AggregateAdapter = {
  aggregate: createDrizzleAggregate(dialect),
};

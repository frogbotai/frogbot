import { type SQL, sql } from 'drizzle-orm';
import { type PgTable, QueryBuilder } from 'drizzle-orm/pg-core';

import { assertPostgresAdapter } from '../../../database/guards.js';
import type { AggregateAdapter } from '../../../database/types.js';
import type { AggregateDateUnit } from '../../types.js';
import {
  type AggregateDialect,
  type AggregateSelect,
  type AggregateSelectQuery,
  createDrizzleAggregate,
} from '../buildAggregateQuery.js';

function bucket(column: SQL, unit: AggregateDateUnit): SQL {
  return sql`date_trunc('${sql.raw(unit)}', ${column}, 'UTC')`;
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
    .from(from as PgTable)
    .$dynamic();

  for (const join of joins) {
    query = query[join.type ?? 'leftJoin'](join.table as PgTable, join.condition);
  }

  query = query.where(where);

  if (groupBy.length) query = query.groupBy(...groupBy);

  if (orderBy.length) query = query.orderBy(...orderBy);

  if (limit) query = query.limit(limit).offset(offset ?? 0);

  return query;
}

const dialect: AggregateDialect = {
  bucket,
  text: (column) => sql`cast(${column} as text)`,
  select,
  async run({ adapter, query, req }) {
    const postgres = assertPostgresAdapter(adapter, 'Aggregate');
    const transactionID = await req.transactionID;
    const db = (transactionID && postgres.sessions[transactionID]?.db) || postgres.drizzle;
    const { rows } = await db.execute<Record<string, unknown>>(query.getSQL());

    return rows;
  },
};

export const postgresAggregateAdapter: AggregateAdapter = {
  aggregate: createDrizzleAggregate(dialect),
};

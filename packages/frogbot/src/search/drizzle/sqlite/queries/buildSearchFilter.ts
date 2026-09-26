import { inArray, type SQL, sql } from 'drizzle-orm';
import { QueryBuilder, type SQLiteTable } from 'drizzle-orm/sqlite-core';

import type { SearchQueryParts } from '../../buildSearchQuery.js';

export function buildSearchFilter({ filter, rowID, table }: SearchQueryParts): SQL | undefined {
  if (!filter.joins.length) return filter.where;

  let eligible = new QueryBuilder()
    .select({ id: sql`${rowID}`.as('id') })
    .from(table as SQLiteTable)
    .$dynamic();

  for (const join of filter.joins) {
    eligible = eligible[join.type ?? 'leftJoin'](join.table as SQLiteTable, join.condition);
  }

  return inArray(rowID, eligible.where(filter.where));
}

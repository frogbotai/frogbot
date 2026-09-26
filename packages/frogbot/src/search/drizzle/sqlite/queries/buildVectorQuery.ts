import type { GenericColumn } from '@payloadcms/drizzle';
import { and, isNotNull, type SQL, sql } from 'drizzle-orm';
import { QueryBuilder, type SQLiteTable } from 'drizzle-orm/sqlite-core';

import type { SearchQueryParts } from '../../buildSearchQuery.js';
import type { SearchTarget } from '../types.js';
import { buildRowSource, getDocumentID } from './buildRowSource.js';

function buildExactCandidates({
  distance,
  filter,
  parts,
  query,
  target,
}: {
  distance: SQL;
  filter: SQL | undefined;
  parts: SearchQueryParts;
  query: string;
  target: SearchTarget;
}): SQL {
  const column = parts.columns.at(-1) as GenericColumn;

  let candidates = new QueryBuilder()
    .select({
      id: sql`${parts.id}`.as('id'),
      distance: sql`${distance}(vector32(${column}), vector32(${query}))`.as('distance'),
    })
    .from(parts.table as SQLiteTable)
    .$dynamic();

  for (const join of parts.joins) {
    candidates = candidates[join.type ?? 'leftJoin'](join.table as SQLiteTable, join.condition);
  }

  return candidates
    .where(
      and(
        filter,
        isNotNull(column),
        sql`json_array_length(${column}) = ${target.vector!.dimensions}`,
      ),
    )
    .getSQL();
}

function buildIndexedCandidates({
  depth,
  distance,
  filter,
  locale,
  query,
  target,
}: {
  depth: number;
  distance: SQL;
  filter: SQL | undefined;
  locale: string;
  query: string;
  target: SearchTarget;
}): SQL {
  const index = target.vector!.index!;
  const table = sql.identifier(index.table);

  const rows = buildRowSource({
    key: index.key,
    locale,
    rowID: sql`${table}."id"`,
    target,
  });

  return sql`SELECT ${getDocumentID(target)} AS "id", ${distance}(${table}."embedding", vector32(${query})) AS "distance" FROM vector_top_k(${index.name}, vector32(${query}), ${sql.raw(String(depth))}) AS "candidates" JOIN ${table} ON ${table}."id" = "candidates"."id" ${rows}${filter ? sql` WHERE ${filter}` : sql``}`;
}

export function buildVectorQuery({
  depth,
  filter,
  limit,
  locale,
  parts,
  target,
  vector,
}: {
  depth: number;
  filter: SQL | undefined;
  limit: number;
  locale: string;
  parts: SearchQueryParts;
  target: SearchTarget;
  vector: number[];
}): SQL {
  const euclidean = target.vector!.metric === 'euclidean';
  const distance = sql.raw(euclidean ? 'vector_distance_l2' : 'vector_distance_cos');
  const score = sql.raw(euclidean ? '"distance"' : '1 - "distance"');
  const query = JSON.stringify(vector);

  const candidates = target.vector!.index
    ? buildIndexedCandidates({ depth, distance, filter, locale, query, target })
    : buildExactCandidates({ distance, filter, parts, query, target });

  return sql`SELECT "id", "distance", ${score} AS "score" FROM (${candidates}) WHERE "distance" IS NOT NULL ORDER BY "distance", "id" LIMIT ${limit}`;
}

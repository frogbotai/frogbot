import type { DrizzleAdapter, GenericColumn } from '@payloadcms/drizzle';
import type { BasePostgresAdapter } from '@payloadcms/drizzle/postgres';
import {
  and,
  asc,
  cosineDistance,
  desc,
  inArray,
  innerProduct,
  isNotNull,
  l2Distance,
  type SQL,
  sql,
} from 'drizzle-orm';
import { type PgTable, QueryBuilder } from 'drizzle-orm/pg-core';
import type { PayloadRequest } from 'payload';

import type { AdapterSearch } from '../../../database/types.js';
import { SearchReadinessError } from '../../errors.js';
import type { SearchComponentRanking, SearchIndexDescriptor, SearchRanking } from '../../types.js';
import { buildSearchQuery, type SearchQueryParts } from '../buildSearchQuery.js';
import { maxHNSWDimensions } from './buildSchema.js';
import { buildTSVector, getTextSearchConfig } from './buildTSVector.js';
import { getErrorCode } from './getErrorCode.js';

const defaultEFSearch = 40;

const maxEFSearch = 1000;

const rankConstant = 60;

const readinessCodes = new Set(['42703', '42704', '42883', '42P01']);

function select(
  { filter, joins, rowID, table }: SearchQueryParts,
  selection: Record<string, SQL.Aliased>,
  where: SQL | undefined,
) {
  let query = new QueryBuilder()
    .select(selection)
    .from(table as PgTable)
    .$dynamic();

  for (const join of joins) {
    query = query[join.type ?? 'leftJoin'](join.table as PgTable, join.condition);
  }

  if (!filter.joins.length) return query.where(and(filter.where, where));

  let eligible = new QueryBuilder()
    .select({ id: sql`${rowID}`.as('id') })
    .from(table as PgTable)
    .$dynamic();

  for (const join of filter.joins) {
    eligible = eligible[join.type ?? 'leftJoin'](join.table as PgTable, join.condition);
  }

  return query.where(and(inArray(rowID, eligible.where(filter.where)), where));
}

function lexicalQuery(parts: SearchQueryParts, index: SearchIndexDescriptor, text: string) {
  const language = index.lexical?.language;
  const document = buildTSVector({
    columns: parts.columns.slice(0, index.lexical?.fields.length),
    language,
  });
  const query = sql`websearch_to_tsquery(${getTextSearchConfig(language)}, ${text})`;
  const score = sql<number>`ts_rank_cd(${document}, ${query})`;

  return select(
    parts,
    { id: sql`${parts.id}`.as('id'), score: score.as('score') },
    sql`${document} @@ ${query}`,
  ).orderBy(desc(score), asc(parts.id));
}

function vectorQuery(parts: SearchQueryParts, index: SearchIndexDescriptor, vector: number[]) {
  const column = parts.columns.at(-1) as GenericColumn;

  const distance = {
    cosine: cosineDistance,
    dotProduct: innerProduct,
    euclidean: l2Distance,
  }[index.vector!.metric](column, vector);

  const score = {
    cosine: sql<number>`1 - (${distance})`,
    dotProduct: sql<number>`(${distance}) * -1`,
    euclidean: distance,
  }[index.vector!.metric];

  return select(
    parts,
    { id: sql`${parts.id}`.as('id'), distance: distance.as('distance'), score: score.as('score') },
    isNotNull(column),
  ).orderBy(distance);
}

async function getDatabase(adapter: BasePostgresAdapter, req: PayloadRequest) {
  const transactionID = await req.transactionID;

  return (transactionID && adapter.sessions[transactionID]?.db) || adapter.drizzle;
}

type HybridRow = {
  id: number | string;
  lexical_rank: number | null;
  lexical_score: number | null;
  score: number;
  vector_rank: number | null;
  vector_score: number | null;
};

function getComponent(rank: number | null, score: number | null) {
  return rank === null || score === null ? null : { rank: Number(rank), score: Number(score) };
}

export const search: AdapterSearch = async ({
  candidates,
  collection,
  db,
  draft,
  index,
  limit,
  locale,
  mode,
  query,
  req,
  where,
}) => {
  const adapter = db as unknown as BasePostgresAdapter;

  const approximate = mode !== 'lexical' && index.vector!.dimensions <= maxHNSWDimensions;

  const lexicalRanking: SearchComponentRanking = {
    method: 'postgres-fts',
    higherIsBetter: true,
    approximate: false,
  };

  const vectorRanking: SearchComponentRanking = {
    method: approximate ? 'pgvector-hnsw' : 'pgvector-exact',
    higherIsBetter: index.vector?.metric !== 'euclidean',
    approximate,
  };

  const ranking: SearchRanking = {
    lexical: lexicalRanking,
    vector: vectorRanking,
    hybrid: {
      method: 'rrf',
      higherIsBetter: true,
      approximate,
      components: { lexical: lexicalRanking, vector: vectorRanking },
    },
  }[mode];

  const paths = [
    ...(mode !== 'vector' ? index.lexical!.fields.map(({ path }) => path) : []),
    ...(mode !== 'lexical' ? [index.vector!.path] : []),
  ];

  const depth = mode === 'hybrid' ? Math.max(limit, candidates ?? limit) : limit;

  try {
    const parts = buildSearchQuery({
      adapter: db as unknown as DrizzleAdapter,
      collection,
      draft,
      locale,
      paths,
      where,
    });

    let statement: SQL;

    if (mode === 'lexical') {
      statement = lexicalQuery(parts, index, query.text!).limit(limit).getSQL();
    } else if (mode === 'vector') {
      statement = vectorQuery(parts, index, query.vector!).limit(limit).getSQL();
    } else {
      const { lexical, vector } = index.hybrid!.weights;
      const lexicalCandidates = lexicalQuery(parts, index, query.text!).limit(depth);
      const vectorCandidates = vectorQuery(parts, index, query.vector!).limit(depth);

      statement = sql`
        with lexical as (
          select id, score, row_number() over (order by score desc, id)::integer as rank
          from ${lexicalCandidates} as candidates
        ),
        vector as (
          select id, score, row_number() over (order by distance, id)::integer as rank
          from ${vectorCandidates} as candidates
        )
        select
          coalesce(lexical.id, vector.id) as id,
          coalesce(${lexical}::double precision / (${rankConstant} + lexical.rank), 0) +
            coalesce(${vector}::double precision / (${rankConstant} + vector.rank), 0) as score,
          lexical.rank as lexical_rank,
          lexical.score as lexical_score,
          vector.rank as vector_rank,
          vector.score as vector_score
        from lexical
        full outer join vector on lexical.id = vector.id
        order by score desc, id
        limit ${limit}
      `;
    }

    const database = await getDatabase(adapter, req);
    const efSearch = Math.min(maxEFSearch, Math.max(defaultEFSearch, depth));

    const { rows } = approximate
      ? await database.transaction(async (tx) => {
          await tx.execute(sql`set local hnsw.iterative_scan = strict_order`);
          await tx.execute(sql`set local hnsw.ef_search = ${sql.raw(String(efSearch))}`);

          return tx.execute<HybridRow>(statement);
        })
      : await database.execute<HybridRow>(statement);

    return {
      ranking,
      rows: rows.map((row) => ({
        id: row.id,
        score: Number(row.score),
        ...(mode === 'hybrid'
          ? {
              components: {
                lexical: getComponent(row.lexical_rank, row.lexical_score),
                vector: getComponent(row.vector_rank, row.vector_score),
              },
            }
          : {}),
      })),
    };
  } catch (error) {
    if (readinessCodes.has(getErrorCode(error) ?? '')) {
      throw new SearchReadinessError(
        `Search index '${index.name}' in collection '${collection}' is not ready. Run migrations to create its columns and indexes.`,
      );
    }

    throw error;
  }
};

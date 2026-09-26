import type { DrizzleAdapter } from '@payloadcms/drizzle';
import { type SQL, sql } from 'drizzle-orm';
import type { PayloadRequest } from 'payload';

import type { AdapterSearch } from '../../../database/types.js';
import type { SearchComponentRanking, SearchRanking } from '../../types.js';
import { buildSearchQuery } from '../buildSearchQuery.js';
import { buildHybridQuery } from './queries/buildHybridQuery.js';
import { buildLexicalQuery } from './queries/buildLexicalQuery.js';
import { buildMatchQuery } from './queries/buildMatchQuery.js';
import { buildSearchFilter } from './queries/buildSearchFilter.js';
import { buildVectorQuery } from './queries/buildVectorQuery.js';
import { getSearchTarget } from './schema/getSearchTarget.js';
import type { SearchDatabase, SQLiteSearchAdapter } from './types.js';

type SearchRow = {
  id: number | string;
  lexical_rank?: null | number;
  lexical_score?: null | number;
  score: number | string;
  vector_rank?: null | number;
  vector_score?: null | number;
};

async function getDatabase(
  adapter: SQLiteSearchAdapter,
  req: PayloadRequest,
): Promise<SearchDatabase> {
  const transactionID = await req.transactionID;

  return ((transactionID && adapter.sessions[transactionID]?.db) ||
    adapter.drizzle) as SearchDatabase;
}

function getComponent(rank: null | number | undefined, score: null | number | undefined) {
  return rank === null || rank === undefined || score === null || score === undefined
    ? null
    : { rank: Number(rank), score: Number(score) };
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
  const adapter = db as unknown as SQLiteSearchAdapter;
  const { localization } = adapter.payload.config;
  const versions = draft && Boolean(adapter.payload.collections[collection].config.versions?.drafts);
  const target = getSearchTarget({ adapter, collection, index, versions });
  const approximate = mode !== 'lexical' && Boolean(target.vector?.index);

  const parts = buildSearchQuery({
    adapter: db as unknown as DrizzleAdapter,
    collection,
    draft,
    locale,
    paths: mode !== 'lexical' && !approximate ? [index.vector!.path] : [],
    where,
  });

  const filter = buildSearchFilter(parts);
  const requestedLocale = locale ?? (localization ? localization.defaultLocale : '');
  const depth = Math.max(limit, candidates ?? limit);
  const match = query.text === undefined ? undefined : buildMatchQuery(query.text);

  const lexicalRanking: SearchComponentRanking = {
    method: 'sqlite-fts5',
    higherIsBetter: true,
    approximate: false,
  };

  const vectorRanking: SearchComponentRanking = {
    method: approximate ? 'libsql-diskann' : 'libsql-exact',
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

  const lexical = (size: number): SQL =>
    match
      ? buildLexicalQuery({ filter, limit: size, locale: requestedLocale, match, target })
      : sql`SELECT NULL AS "id", NULL AS "score" WHERE 0`;

  const vector = (size: number): SQL =>
    buildVectorQuery({
      depth,
      filter,
      limit: size,
      locale: requestedLocale,
      parts,
      target,
      vector: query.vector!,
    });

  if (mode === 'lexical' && !match) return { ranking, rows: [] };

  const statement = {
    lexical: () => lexical(limit),
    vector: () => vector(limit),
    hybrid: () =>
      buildHybridQuery({
        lexical: lexical(depth),
        limit,
        vector: vector(depth),
        weights: index.hybrid!.weights,
      }),
  }[mode]();

  const database = await getDatabase(adapter, req);
  const rows = await database.all<SearchRow>(statement);

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
};

import type { MongooseAdapter } from '@payloadcms/db-mongodb';
import type {
  AdapterSearch,
  SearchComponentRanking,
  SearchHitComponent,
  SearchIndexDescriptor,
  SearchMode,
  SearchRanking,
} from 'frogbot/search';
import { SearchReadinessError } from 'frogbot/search';

import { getSearchIndexes } from './getSearchIndexes.js';
import type { SearchPipeline } from './getSearchModel.js';
import { getSearchModel } from './getSearchModel.js';
import { getSearchFields, getSearchPath } from './getSearchPath.js';
import { buildHybridPipeline } from './pipelines/buildHybridPipeline.js';
import { buildSearchStage } from './pipelines/buildSearchStage.js';
import { buildVectorScore } from './pipelines/buildVectorScore.js';
import {
  buildVectorSearchStage,
  isApproximateVectorSearch,
} from './pipelines/buildVectorSearchStage.js';
import { buildSearchFilter } from './queries/buildSearchFilter.js';
import { buildSearchOperator } from './queries/buildSearchOperator.js';
import { buildVectorSearchFilter } from './queries/buildVectorSearchFilter.js';
import { supportsRankFusion } from './supportsRankFusion.js';

type SearchRow = {
  id: unknown;
  lexical?: unknown;
  score: number;
  vector?: unknown;
};

const distinctParentStages = [
  { $sort: { score: -1, id: 1 } },
  { $group: { _id: '$id', row: { $first: '$$ROOT' } } },
  { $replaceRoot: { newRoot: '$row' } },
  { $sort: { score: -1, id: 1 } },
];

function getRanking({
  approximate,
  index,
  mode,
}: {
  approximate: boolean;
  index: SearchIndexDescriptor;
  mode: SearchMode;
}): SearchRanking {
  const lexical: SearchComponentRanking = {
    method: 'mongodb-search',
    higherIsBetter: true,
    approximate: false,
  };

  const vector: SearchComponentRanking = {
    method: approximate ? 'mongodb-hnsw' : 'mongodb-exact',
    higherIsBetter: index.vector?.metric !== 'euclidean',
    approximate,
  };

  if (mode === 'lexical') return lexical;

  if (mode === 'vector') return vector;

  return { method: 'rrf', higherIsBetter: true, approximate, components: { lexical, vector } };
}

function buildScoreStage({
  index,
  mode,
}: {
  index: SearchIndexDescriptor;
  mode: SearchMode;
}): Record<string, unknown> | undefined {
  if (mode === 'lexical') return undefined;

  const { metric } = index.vector!;

  if (mode === 'vector') {
    return { $project: { _id: 0, id: 1, score: buildVectorScore({ metric, score: '$score' }) } };
  }

  return {
    $project: {
      _id: 0,
      id: 1,
      score: 1,
      lexical: 1,
      vector: {
        $cond: [
          { $eq: [{ $ifNull: ['$vector', null] }, null] },
          null,
          { rank: '$vector.rank', score: buildVectorScore({ metric, score: '$vector.score' }) },
        ],
      },
    },
  };
}

function getComponent(component: unknown): SearchHitComponent | null {
  if (!component || typeof component !== 'object') return null;

  const { rank, score } = component as SearchHitComponent;

  return { rank: Number(rank), score: Number(score) };
}

export const search: AdapterSearch = async ({
  candidates,
  collection,
  db,
  draft,
  index,
  limit,
  locale: requestedLocale,
  mode,
  query,
  where,
}) => {
  const adapter = db as MongooseAdapter;
  const { localization } = adapter.payload.config;
  const locale = requestedLocale ?? (localization ? localization.defaultLocale : undefined);
  const versions =
    draft && Boolean(adapter.payload.collections[collection].config.versions?.drafts);

  const searchIndexes = getSearchIndexes(adapter).filter(
    (searchIndex) =>
      searchIndex.collection === collection &&
      searchIndex.index === index.name &&
      searchIndex.versions === versions,
  );

  if (!searchIndexes.length) {
    throw new SearchReadinessError(
      `Search index '${index.name}' is not set up for collection '${collection}'. Restart to apply search configuration changes.`,
    );
  }

  const lexicalIndex = searchIndexes.find((searchIndex) => searchIndex.mode === 'lexical');
  const vectorIndex = searchIndexes.find((searchIndex) => searchIndex.mode === 'vector');

  const depth = Math.max(limit, candidates ?? limit);
  const vectorLimit = mode === 'hybrid' ? depth : limit;

  const approximate =
    mode !== 'lexical' &&
    isApproximateVectorSearch({ approximate: index.vector!.approximate, limit: vectorLimit });

  const ranking = getRanking({ approximate, index, mode });
  const filter = await buildSearchFilter({ adapter, locale, searchIndex: searchIndexes[0], where });

  if (filter === false) return { ranking, rows: [] };

  const Model = getSearchModel({ adapter, collection, versions });
  const fields = getSearchFields({ adapter, collection, versions });
  const idPath = versions ? 'parent' : '_id';

  const getPath = (path: string) =>
    getSearchPath({ adapter, collection, fields, locale, path, versions }).path;

  const getSearchPipeline = (searchLimit: number) => [
    buildSearchStage({
      filter: filter === true ? undefined : buildSearchOperator(filter),
      name: lexicalIndex!.name,
      paths: index.lexical!.fields.map(({ path }) => getPath(path)),
      text: query.text!,
    }),
    { $limit: searchLimit },
  ];

  const getVectorSearchStage = () =>
    buildVectorSearchStage({
      approximate,
      candidates: depth,
      filter: filter === true ? undefined : buildVectorSearchFilter(filter),
      limit: vectorLimit,
      name: vectorIndex!.name,
      path: getPath(index.vector!.path),
      vector: query.vector!,
    });

  let pipeline: Record<string, unknown>[];

  if (mode === 'lexical') {
    pipeline = [
      ...getSearchPipeline(limit),
      { $project: { _id: 0, id: `$${idPath}`, score: { $meta: 'searchScore' } } },
    ];
  } else if (mode === 'vector') {
    pipeline = [
      getVectorSearchStage(),
      { $project: { _id: 0, id: `$${idPath}`, score: { $meta: 'vectorSearchScore' } } },
    ];
  } else {
    pipeline = buildHybridPipeline({
      collection: Model.collection.name,
      idPath,
      limit,
      rankFusion: await supportsRankFusion(Model),
      searchPipeline: getSearchPipeline(depth),
      vectorSearchStage: getVectorSearchStage(),
      weights: index.hybrid!.weights,
    });
  }

  if (versions) pipeline.push(...distinctParentStages);

  const scoreStage = buildScoreStage({ index, mode });

  if (scoreStage) pipeline.push(scoreStage);

  const rows: SearchRow[] = await Model.aggregate(pipeline as unknown as SearchPipeline).exec();

  return {
    ranking,
    rows: rows.map(({ id, lexical, score, vector }) => ({
      id: typeof id === 'number' ? id : String(id),
      score,
      ...(mode === 'hybrid'
        ? { components: { lexical: getComponent(lexical), vector: getComponent(vector) } }
        : {}),
    })),
  };
};

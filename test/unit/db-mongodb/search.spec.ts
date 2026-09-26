import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';

import { capabilities } from '../../../../packages/db-mongodb/src/search/capabilities.js';
import { createSearchSetupError } from '../../../../packages/db-mongodb/src/search/createSearchSetupError.js';
import { isSearchIndexDefinitionEqual } from '../../../../packages/db-mongodb/src/search/isSearchIndexDefinitionEqual.js';
import { buildHybridPipeline } from '../../../../packages/db-mongodb/src/search/pipelines/buildHybridPipeline.js';
import { buildVectorScore } from '../../../../packages/db-mongodb/src/search/pipelines/buildVectorScore.js';
import {
  buildVectorSearchStage,
  isApproximateVectorSearch,
} from '../../../../packages/db-mongodb/src/search/pipelines/buildVectorSearchStage.js';
import { buildSearchOperator } from '../../../../packages/db-mongodb/src/search/queries/buildSearchOperator.js';
import { buildVectorSearchFilter } from '../../../../packages/db-mongodb/src/search/queries/buildVectorSearchFilter.js';
import { parseSearchFilter } from '../../../../packages/db-mongodb/src/search/queries/parseSearchFilter.js';
import type {
  SearchFieldType,
  SearchFilterNode,
  SearchIndex,
} from '../../../../packages/db-mongodb/src/search/types.js';
import type { SearchIndexDescriptor } from '../../../../packages/frogbot/src/search/types.js';

vi.mock('frogbot/search', () => import('../../../../packages/frogbot/src/exports/search.js'));

const require = createRequire(
  new URL('../../../../packages/db-mongodb/package.json', import.meta.url),
);

const { Types } = createRequire(require.resolve('@payloadcms/db-mongodb'))('mongoose');

const fields = new Map<string, SearchFieldType>([
  ['_id', 'objectId'],
  ['flag', 'boolean'],
  ['kind', 'token'],
  ['rank', 'number'],
  ['publishedAt', 'date'],
]);

const parse = (query: Record<string, unknown>) =>
  parseSearchFilter({ fields, index: 'content', query });

const descriptor = (overrides: Partial<SearchIndexDescriptor>): SearchIndexDescriptor => ({
  name: 'content',
  filterFields: {},
  ...overrides,
});

describe('parseSearchFilter', () => {
  it('matches everything for an empty query', () => {
    expect(parse({})).toBe(true);
  });

  it('parses comparison operators into filter nodes', () => {
    const date = new Date('2024-01-01');

    expect(
      parse({
        kind: { $eq: 'a' },
        rank: { $gte: 1, $lt: 5 },
        publishedAt: { $gt: date },
        flag: true,
      }),
    ).toEqual({
      type: 'and',
      filters: [
        { type: 'equals', path: 'kind', value: 'a' },
        { type: 'range', path: 'rank', range: { gte: 1, lt: 5 } },
        { type: 'range', path: 'publishedAt', range: { gt: date } },
        { type: 'equals', path: 'flag', value: true },
      ],
    });
  });

  it('expands null equality to missing or null values', () => {
    expect(parse({ kind: { $eq: null } })).toEqual({
      type: 'or',
      filters: [
        { type: 'not', filter: { type: 'exists', path: 'kind' } },
        { type: 'equals', path: 'kind', value: null },
      ],
    });
  });

  it('removes duplicate conditions', () => {
    expect(parse({ $or: [{ kind: { $exists: false } }, { kind: { $eq: null } }] })).toEqual({
      type: 'or',
      filters: [
        { type: 'not', filter: { type: 'exists', path: 'kind' } },
        { type: 'equals', path: 'kind', value: null },
      ],
    });
  });

  it('splits null out of lists', () => {
    expect(parse({ kind: { $in: ['a', null] } })).toEqual({
      type: 'or',
      filters: [
        { type: 'in', path: 'kind', values: ['a'] },
        { type: 'not', filter: { type: 'exists', path: 'kind' } },
        { type: 'equals', path: 'kind', value: null },
      ],
    });
  });

  it('drops values that can never match the mapped type', () => {
    const id = new Types.ObjectId();

    expect(parse({ $or: [{ _id: { $eq: id.toHexString() } }, { _id: { $eq: id } }] })).toEqual({
      type: 'equals',
      path: '_id',
      value: id,
    });

    expect(
      parse({
        $or: [
          { publishedAt: { $exists: false } },
          { publishedAt: { $eq: null } },
          { publishedAt: { $eq: '' } },
        ],
      }),
    ).toEqual({
      type: 'or',
      filters: [
        { type: 'not', filter: { type: 'exists', path: 'publishedAt' } },
        { type: 'equals', path: 'publishedAt', value: null },
      ],
    });

    expect(parse({ rank: { $eq: 'x' } })).toBe(false);
    expect(parse({ rank: { $ne: 'x' } })).toBe(true);
    expect(parse({ rank: { $nin: ['x'] } })).toBe(true);
  });

  it('negates with $ne, $nin, $not and $nor', () => {
    expect(parse({ kind: { $ne: 'a' } })).toEqual({
      type: 'not',
      filter: { type: 'equals', path: 'kind', value: 'a' },
    });

    expect(parse({ $nor: [{ kind: 'a' }, { rank: { $not: { $gt: 1 } } }] })).toEqual({
      type: 'not',
      filter: {
        type: 'or',
        filters: [
          { type: 'equals', path: 'kind', value: 'a' },
          { type: 'not', filter: { type: 'range', path: 'rank', range: { gt: 1 } } },
        ],
      },
    });
  });

  it.each([
    { name: 'an unmapped path', query: { other: { $eq: 1 } } },
    { name: 'a regular expression', query: { kind: { $regex: 'a' } } },
    { name: 'an element match', query: { kind: { $elemMatch: { $eq: 'a' } } } },
    { name: 'a boolean range', query: { flag: { $gt: true } } },
    { name: 'an array value', query: { kind: ['a'] } },
    { name: 'a top-level operator', query: { $where: 'true' } },
  ])('rejects $name', ({ query }) => {
    expect(() => parse(query)).toThrow(
      expect.objectContaining({ name: 'SearchFilterUnsupportedError', status: 400 }),
    );
  });
});

describe('search filter builders', () => {
  const filter: SearchFilterNode = {
    type: 'and',
    filters: [
      { type: 'equals', path: 'kind', value: 'a' },
      { type: 'in', path: 'rank', values: [1, 2] },
      {
        type: 'or',
        filters: [
          { type: 'not', filter: { type: 'exists', path: 'publishedAt' } },
          { type: 'range', path: 'rank', range: { gte: 1, lt: 5 } },
        ],
      },
    ],
  };

  it('builds a vector search filter', () => {
    expect(buildVectorSearchFilter(filter)).toEqual({
      $and: [
        { kind: { $eq: 'a' } },
        { rank: { $in: [1, 2] } },
        {
          $or: [{ $nor: [{ publishedAt: { $exists: true } }] }, { rank: { $gte: 1, $lt: 5 } }],
        },
      ],
    });
  });

  it('builds a search compound operator', () => {
    expect(buildSearchOperator(filter)).toEqual({
      compound: {
        filter: [
          { equals: { path: 'kind', value: 'a' } },
          { in: { path: 'rank', value: [1, 2] } },
          {
            compound: {
              should: [
                { compound: { mustNot: [{ exists: { path: 'publishedAt' } }] } },
                { range: { path: 'rank', gte: 1, lt: 5 } },
              ],
              minimumShouldMatch: 1,
            },
          },
        ],
      },
    });
  });
});

describe('isSearchIndexDefinitionEqual', () => {
  const expected = {
    mappings: {
      dynamic: false,
      fields: {
        title: [{ type: 'string', analyzer: 'lucene.standard' }, { type: 'token' }],
        meta: { type: 'document', dynamic: false, fields: { rank: { type: 'number' } } },
      },
    },
  };

  it('ignores server defaults and array order', () => {
    expect(
      isSearchIndexDefinitionEqual({
        expected,
        actual: {
          mappings: {
            dynamic: false,
            fields: {
              meta: {
                type: 'document',
                dynamic: false,
                fields: { rank: { type: 'number', representation: 'double' } },
              },
              title: [
                { type: 'token' },
                { type: 'string', analyzer: 'lucene.standard', store: true },
              ],
            },
          },
        },
      }),
    ).toBe(true);
  });

  it('detects added, removed and changed mappings', () => {
    const actual = structuredClone(expected);

    expect(
      isSearchIndexDefinitionEqual({
        expected,
        actual: {
          mappings: { ...actual.mappings, fields: { ...actual.mappings.fields, old: {} } },
        },
      }),
    ).toBe(false);

    expect(
      isSearchIndexDefinitionEqual({
        expected,
        actual: { mappings: { dynamic: false, fields: { title: actual.mappings.fields.title } } },
      }),
    ).toBe(false);

    expect(
      isSearchIndexDefinitionEqual({
        expected: { fields: [{ type: 'vector', path: 'v', numDimensions: 3 }] },
        actual: { fields: [{ type: 'vector', path: 'v', numDimensions: 4 }] },
      }),
    ).toBe(false);
  });
});

describe('capabilities', () => {
  it('supports every mode for built-in analyzers and bounded dimensions', () => {
    expect(
      capabilities({
        collection: 'posts',
        db: {} as never,
        index: descriptor({
          lexical: { fields: [], language: 'french' },
          vector: {
            path: 'embedding',
            localized: false,
            dimensions: 8192,
            metric: 'cosine',
            approximate: true,
          },
        }),
      }),
    ).toEqual({ lexical: 'supported', vector: 'supported', hybrid: 'supported' });
  });

  it('reports engine gaps for unknown languages and oversized vectors', () => {
    const result = capabilities({
      collection: 'posts',
      db: {} as never,
      index: descriptor({
        lexical: { fields: [], language: 'klingon' },
        vector: {
          path: 'embedding',
          localized: false,
          dimensions: 8193,
          metric: 'cosine',
          approximate: true,
        },
      }),
    });

    expect(result.lexical).toMatchObject({ unsupported: 'engine-gap' });
    expect(result.vector).toMatchObject({ unsupported: 'engine-gap' });
    expect(result.hybrid).toEqual(result.lexical);
  });
});

describe('createSearchSetupError', () => {
  const searchIndex = {
    collection: 'posts',
    index: 'content',
    mode: 'vector',
    name: 'content_vector',
  } as SearchIndex;

  it.each([
    { code: 31082, message: 'SearchNotEnabled', reason: 'missing-prerequisite' },
    { code: 40324, message: 'Unrecognized pipeline stage', reason: 'missing-prerequisite' },
    { code: 13, message: 'not authorized', reason: 'permission-denied' },
    { code: 8000, message: 'user is not allowed to do action', reason: 'permission-denied' },
    { code: 8000, message: 'index limit reached', reason: 'setup-failed' },
    { code: 2, message: 'bad value', reason: 'setup-failed' },
  ])('classifies server code $code ($message) as $reason', ({ code, message, reason }) => {
    const error = createSearchSetupError({
      error: Object.assign(new Error(message), { code }),
      searchIndex,
    });

    expect(error).toMatchObject({ reason, status: 501 });
    expect(error.message).toContain(`content' in collection 'posts' (vector): ${reason}`);
  });
});

describe('buildVectorSearchStage', () => {
  it.each([
    { approximate: true, candidates: 100, limit: 10, breadth: { numCandidates: 100 } },
    { approximate: true, candidates: 20000, limit: 10, breadth: { numCandidates: 10000 } },
    { approximate: true, candidates: 10000, limit: 10000, breadth: { numCandidates: 10000 } },
    { approximate: true, candidates: 10001, limit: 10001, breadth: { exact: true } },
    { approximate: false, candidates: 100, limit: 10, breadth: { exact: true } },
  ])(
    'searches with $breadth for approximate $approximate, $candidates candidates and limit $limit',
    ({ approximate, breadth, candidates, limit }) => {
      const stage = buildVectorSearchStage({
        approximate,
        candidates,
        limit,
        name: 'content_vector',
        path: 'v',
        vector: [1],
      });

      expect(stage).toEqual({
        $vectorSearch: { index: 'content_vector', path: 'v', queryVector: [1], limit, ...breadth },
      });

      expect(isApproximateVectorSearch({ approximate, limit })).toBe('numCandidates' in breadth);
    },
  );
});

describe('buildVectorScore', () => {
  it.each([
    { metric: 'cosine', expression: { $subtract: [{ $multiply: [2, '$score'] }, 1] } },
    { metric: 'dotProduct', expression: { $subtract: [{ $multiply: [2, '$score'] }, 1] } },
    { metric: 'euclidean', expression: { $subtract: [{ $divide: [1, '$score'] }, 1] } },
  ] as const)(
    'converts a normalized $metric score back to the metric',
    ({ expression, metric }) => {
      expect(buildVectorScore({ metric, score: '$score' })).toEqual(expression);
    },
  );
});

describe('buildHybridPipeline', () => {
  const searchPipeline = [{ $search: {} }, { $limit: 4 }];
  const vectorSearchStage = { $vectorSearch: {} };
  const weights = { lexical: 1, vector: 2 };

  it('fuses with $rankFusion and reads component ranks from score details', () => {
    const [fusion, limit, project, components] = buildHybridPipeline({
      collection: 'posts',
      idPath: '_id',
      limit: 2,
      rankFusion: true,
      searchPipeline,
      vectorSearchStage,
      weights,
    });

    expect(fusion).toEqual({
      $rankFusion: {
        input: { pipelines: { lexical: searchPipeline, vector: [vectorSearchStage] } },
        combination: { weights },
        scoreDetails: true,
      },
    });

    expect(limit).toEqual({ $limit: 2 });

    expect(project).toEqual({
      $project: {
        _id: 0,
        id: '$_id',
        score: { $meta: 'score' },
        details: { $meta: 'scoreDetails' },
      },
    });

    expect(Object.keys((components as { $project: object }).$project)).toEqual([
      'id',
      'score',
      'lexical',
      'vector',
    ]);
  });

  it('ranks each component and fuses weighted reciprocal ranks with $unionWith otherwise', () => {
    const pipeline = buildHybridPipeline({
      collection: '_posts_versions',
      idPath: 'parent',
      limit: 2,
      rankFusion: false,
      searchPipeline,
      vectorSearchStage,
      weights,
    });

    const rank = (component: string, meta: string) => [
      { $project: { _id: 0, id: '$parent', score: { $meta: meta } } },
      { $setWindowFields: { sortBy: { score: -1 }, output: { rank: { $rank: {} } } } },
      { $project: { id: 1, [component]: { rank: '$rank', score: '$score' } } },
    ];

    const reciprocalRank = (component: string, weight: number) => ({
      $ifNull: [{ $divide: [weight, { $add: [60, `$${component}.rank`] }] }, 0],
    });

    expect(pipeline).toEqual([
      vectorSearchStage,
      ...rank('vector', 'vectorSearchScore'),
      {
        $unionWith: {
          coll: '_posts_versions',
          pipeline: [...searchPipeline, ...rank('lexical', 'searchScore')],
        },
      },
      { $group: { _id: '$id', lexical: { $min: '$lexical' }, vector: { $min: '$vector' } } },
      {
        $project: {
          _id: 0,
          id: '$_id',
          score: { $add: [reciprocalRank('lexical', 1), reciprocalRank('vector', 2)] },
          lexical: { $ifNull: ['$lexical', null] },
          vector: { $ifNull: ['$vector', null] },
        },
      },
      { $sort: { score: -1, id: 1 } },
      { $limit: 2 },
    ]);
  });
});

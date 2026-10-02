import { describe, expect, it } from 'vitest';

import { sanitize } from '../../../../packages/frogbot/src/config/sanitize.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import {
  buildSearchEndpoints,
  buildSearchManyEndpoint,
} from '../../../../packages/frogbot/src/search/endpoints.js';
import { SearchValidationError } from '../../../../packages/frogbot/src/search/errors.js';
import {
  searchManyOperation,
  searchOperation,
} from '../../../../packages/frogbot/src/search/operation.js';
import type {
  SearchManyOptions,
  SearchOptions,
} from '../../../../packages/frogbot/src/search/types.js';
import { hybridRanking, ranking, searchFixture } from './fixture.js';

function restFixture(
  body: () => Promise<unknown>,
  options: Parameters<typeof searchFixture>[0] = {},
) {
  const fixture = searchFixture(options);

  Object.assign(fixture.frogbot, {
    search: (options: SearchOptions) => searchOperation(fixture.frogbot, fixture.payload, options),
  });

  fixture.req.json = body;

  const [endpoint] = buildSearchEndpoints({ collection: 'articles' });

  return { ...fixture, endpoint };
}

function restManyFixture(
  body: () => Promise<unknown>,
  options: Parameters<typeof searchFixture>[0] = {},
) {
  const fixture = searchFixture(options);

  Object.assign(fixture.frogbot, {
    searchMany: (options: SearchManyOptions) =>
      searchManyOperation(fixture.frogbot, fixture.payload, options),
  });

  fixture.req.json = body;

  const endpoint = buildSearchManyEndpoint();

  return { ...fixture, endpoint };
}

function searchConfig(collections: FrogBotConfig['collections']): FrogBotConfig {
  return {
    secret: 'test-secret',
    db: { defaultIDType: 'number' } as FrogBotConfig['db'],
    collections,
  };
}

const collections = [
  { collection: 'articles', index: 'content' },
  { collection: 'faqs', index: 'answers' },
];

describe('collection search REST endpoint', () => {
  it('POST /api/articles/search ranks within the requesting user access and returns hits', async () => {
    const { endpoint, find, req, search } = restFixture(async () => ({
      index: 'content',
      query: { text: 'hello' },
      limit: 5,
      select: { title: true },
    }));

    const response = await endpoint.handler(req);

    expect(endpoint).toMatchObject({ method: 'post', path: '/search' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      mode: 'lexical',
      ranking,
      hits: [{ doc: { id: 1, title: 'stored' }, score: 0.5 }],
    });
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ limit: 5, mode: 'lexical' }));
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ overrideAccess: false, select: { title: true } }),
    );
  });

  it('POST /api/articles/search forwards hybrid candidates to the adapter', async () => {
    const { endpoint, req, search } = restFixture(
      async () => ({
        index: 'content',
        query: { text: 'hello', vector: [1, 0, 0] },
        limit: 5,
        candidates: 250,
      }),
      { rows: [], rowRanking: hybridRanking },
    );

    const response = await endpoint.handler(req);

    expect(await response.json()).toEqual({ mode: 'hybrid', ranking: hybridRanking, hits: [] });
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ candidates: 250, limit: 5, mode: 'hybrid' }),
    );
  });

  it.each(['overrideAccess', 'collection', 'req'])(
    'POST /api/articles/search rejects a body that sets %s',
    async (key) => {
      const { endpoint, req, search } = restFixture(async () => ({
        index: 'content',
        query: { text: 'hello' },
        [key]: true,
      }));

      await expect(endpoint.handler(req)).rejects.toMatchObject({
        name: 'SearchValidationError',
        status: 400,
      });

      expect(search).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['malformed JSON', () => Promise.reject(new SyntaxError('Unexpected token'))],
    ['an array', async () => []],
    ['a string', async () => 'hello'],
  ])('POST /api/articles/search rejects %s as a 400 validation error', async (_label, body) => {
    const { endpoint, req } = restFixture(body);

    await expect(endpoint.handler(req)).rejects.toBeInstanceOf(SearchValidationError);
  });

  it('POST /api/articles/search surfaces invalid query input with its API status', async () => {
    const { endpoint, req } = restFixture(async () => ({ index: 'content', query: {} }));

    await expect(endpoint.handler(req)).rejects.toMatchObject({ status: 400 });
  });

  it('registers the endpoint only on collections with search indexes', async () => {
    const config = searchConfig([
      {
        slug: 'articles',
        fields: [{ name: 'title', type: 'text' }],
        search: { titles: { lexical: { fields: ['title'] } } },
      },
      { slug: 'notes', fields: [{ name: 'title', type: 'text' }] },
    ]);

    const runtime = await sanitize(config)._internal.payloadConfig;

    const searchEndpoints = (slug: string) =>
      (runtime.collections.find((collection) => collection.slug === slug)?.endpoints || []).filter(
        ({ method, path }) => method === 'post' && path === '/search',
      );

    expect(searchEndpoints('articles')).toHaveLength(1);
    expect(searchEndpoints('notes')).toEqual([]);
  });
});

describe('cross-collection search REST endpoint', () => {
  it('POST /api/frogbot/search ranks each collection within the requesting user access', async () => {
    const { endpoint, find, req, search } = restManyFixture(async () => ({
      collections: [collections[0], { ...collections[1], select: { question: true } }],
      query: { text: 'hello' },
      limit: 5,
    }));

    const response = await endpoint.handler(req);

    expect(endpoint).toMatchObject({ method: 'post', path: '/frogbot/search' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [
        {
          collection: 'articles',
          mode: 'lexical',
          ranking,
          hits: [{ doc: { id: 1, title: 'stored' }, score: 0.5 }],
        },
        {
          collection: 'faqs',
          mode: 'lexical',
          ranking,
          hits: [{ doc: { id: 7, question: 'stored' }, score: 0.4 }],
        },
      ],
    });
    expect(search.mock.calls.map(([args]) => [args.collection, args.limit])).toEqual([
      ['articles', 5],
      ['faqs', 5],
    ]);
    expect(find.mock.calls.map(([args]) => [args.collection, args.overrideAccess])).toEqual([
      ['articles', false],
      ['faqs', false],
    ]);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'faqs', select: { question: true } }),
    );
  });

  it('POST /api/frogbot/search fails the whole request when the user cannot read one collection', async () => {
    const { endpoint, req } = restManyFixture(
      async () => ({ collections, query: { text: 'hello' } }),
      { faqs: { read: () => false } },
    );

    await expect(endpoint.handler(req)).rejects.toMatchObject({ status: 403 });
  });

  it.each([
    'collection',
    'index',
    'where',
    'select',
    'candidates',
    'depth',
    'overrideAccess',
    'req',
  ])('POST /api/frogbot/search rejects a top-level %s', async (key) => {
    const { endpoint, req, search } = restManyFixture(async () => ({
      collections,
      query: { text: 'hello' },
      [key]: true,
    }));

    await expect(endpoint.handler(req)).rejects.toMatchObject({
      name: 'SearchValidationError',
      status: 400,
      message: `Search does not support the '${key}' option.`,
    });

    expect(search).not.toHaveBeenCalled();
  });

  it.each([
    ['without collections', { query: { text: 'hello' } }],
    ['with a non-array collections', { collections: collections[0], query: { text: 'hello' } }],
    [
      'with a per-collection query',
      { collections: [{ ...collections[0], query: { text: 'hi' } }], query: { text: 'hello' } },
    ],
  ])(
    'POST /api/frogbot/search rejects a body %s as a 400 validation error',
    async (_label, body) => {
      const { endpoint, find, req, search } = restManyFixture(async () => body);

      await expect(endpoint.handler(req)).rejects.toMatchObject({
        name: 'SearchValidationError',
        status: 400,
      });

      expect(search).not.toHaveBeenCalled();
      expect(find).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['malformed JSON', () => Promise.reject(new SyntaxError('Unexpected token'))],
    ['an array', async () => []],
    ['a string', async () => 'hello'],
  ])('POST /api/frogbot/search rejects %s as a 400 validation error', async (_label, body) => {
    const { endpoint, req } = restManyFixture(body);

    await expect(endpoint.handler(req)).rejects.toBeInstanceOf(SearchValidationError);
  });

  it('registers the endpoint only when some collection has a search index', async () => {
    const articles = { slug: 'articles', fields: [{ name: 'title', type: 'text' as const }] };

    const indexed = await sanitize(
      searchConfig([{ ...articles, search: { titles: { lexical: { fields: ['title'] } } } }]),
    )._internal.payloadConfig;

    const unindexed = await sanitize(searchConfig([articles]))._internal.payloadConfig;

    const routes = (config: typeof indexed) =>
      (config.endpoints || [])
        .filter(({ path }) => path.startsWith('/frogbot'))
        .map(({ method, path }) => `${method} ${path}`);

    expect(routes(indexed)).toEqual(['get /frogbot', 'post /frogbot/search']);
    expect(routes(unindexed)).toEqual(['get /frogbot']);
  });
});

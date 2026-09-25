import { createRequire } from 'node:module';

import type { GraphQLExtension, Payload, SanitizedConfig } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { sanitize } from '../../../../packages/frogbot/src/config/sanitize.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import type { FrogBot } from '../../../../packages/frogbot/src/frogbot.js';
import { registerFrogBotInstance } from '../../../../packages/frogbot/src/instanceRegistry.js';
import { ranking } from './fixture.js';

const require = createRequire(import.meta.url);
const GraphQL = createRequire(require.resolve('payload'))(
  'graphql',
) as Parameters<GraphQLExtension>[0];

const titles = { titles: { lexical: { fields: ['title'] } } };

function config(overrides: Partial<FrogBotConfig> = {}): FrogBotConfig {
  return {
    secret: 'test-secret',
    db: { defaultIDType: 'number' } as FrogBotConfig['db'],
    collections: [
      { slug: 'articles', fields: [{ name: 'title', type: 'text' }], search: titles },
      { slug: 'notes', fields: [{ name: 'title', type: 'text' }] },
      {
        slug: 'drafts',
        graphQL: { disableQueries: true },
        fields: [{ name: 'title', type: 'text' }],
        search: titles,
      },
      { slug: 'hidden', graphQL: false, fields: [{ name: 'title', type: 'text' }], search: titles },
    ],
    ...overrides,
  };
}

function graphQLContext(runtime: SanitizedConfig) {
  const { GraphQLInputObjectType, GraphQLInt, GraphQLObjectType, GraphQLString } = GraphQL;

  const names: Record<string, string> = { articles: 'Article', drafts: 'Draft', notes: 'Note' };

  const collections = Object.fromEntries(
    runtime.collections.map((collection) => {
      const singular = names[collection.slug];

      if (!singular) return [collection.slug, { config: collection }];

      const graphQL = {
        type: new GraphQLObjectType({
          name: singular,
          fields: { id: { type: GraphQLInt }, title: { type: GraphQLString } },
        }),
        paginatedType: new GraphQLObjectType({
          name: `${singular}s`,
          fields: { totalDocs: { type: GraphQLInt } },
        }),
        whereInputType: new GraphQLInputObjectType({
          name: `${singular}_where`,
          fields: { title: { type: GraphQLString } },
        }),
      };

      return [collection.slug, { config: collection, graphQL }];
    }),
  );

  return {
    collections,
    config: runtime,
    globals: { config: [] },
    Mutation: { name: 'Mutation', fields: {} },
    Query: { name: 'Query', fields: {} },
    types: {
      arrayTypes: {},
      blockInputTypes: {},
      blockTypes: {},
      groupTypes: {},
      tabTypes: {},
    },
  } as unknown as Parameters<GraphQLExtension>[1];
}

async function buildQueries(input: FrogBotConfig) {
  const sanitized = sanitize(input);
  const runtime = await sanitized._internal.payloadConfig;
  const queries = runtime.graphQL.queries?.(GraphQL, graphQLContext(runtime)) ?? {};

  return { queries, sanitized };
}

describe('collection search GraphQL queries', () => {
  it('adds a search query only for searchable collections with GraphQL queries enabled', async () => {
    const { queries } = await buildQueries(config());

    expect(Object.keys(queries)).toEqual(['searchArticles']);
  });

  it('keeps application-defined GraphQL queries alongside search queries', async () => {
    const { queries } = await buildQueries(
      config({
        graphQL: {
          queries: (graphQL) => ({ ping: { type: graphQL.GraphQLString, resolve: () => 'pong' } }),
        },
      }),
    );

    expect(Object.keys(queries).sort()).toEqual(['ping', 'searchArticles']);
  });

  it('adds no search queries when no collection declares a search index', async () => {
    const sanitized = sanitize(
      config({ collections: [{ slug: 'notes', fields: [{ name: 'title', type: 'text' }] }] }),
    );

    const runtime = await sanitized._internal.payloadConfig;

    expect(runtime.graphQL.queries).toBeUndefined();
  });

  it('resolves searchArticles through collection search with the request user access', async () => {
    const { queries, sanitized } = await buildQueries(config());

    const search = vi.fn(async () => ({
      mode: 'lexical',
      ranking,
      hits: [{ doc: { id: 1, title: 'stored' }, score: 0.5 }],
    }));

    const payload = {} as Payload;
    const frogbot = { search } as unknown as FrogBot;

    registerFrogBotInstance(payload, frogbot, sanitized);

    const schema = new GraphQL.GraphQLSchema({
      query: new GraphQL.GraphQLObjectType({ name: 'Query', fields: queries as never }),
    });

    const result = await GraphQL.graphql({
      schema,
      source:
        '{ searchArticles(index: "titles", text: "hello", limit: 2) { mode ranking { method higherIsBetter approximate } hits { score doc { id title } } } }',
      contextValue: { req: { payload, context: {}, user: { id: 1 } } },
    });

    expect(result).toEqual({
      data: {
        searchArticles: {
          mode: 'lexical',
          ranking,
          hits: [{ score: 0.5, doc: { id: 1, title: 'stored' } }],
        },
      },
    });
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'articles',
        index: 'titles',
        limit: 2,
        overrideAccess: false,
        query: { text: 'hello', vector: undefined },
      }),
    );
  });

  it('passes hybrid candidates and returns component ranks and scores', async () => {
    const { queries, sanitized } = await buildQueries(config());

    const components = {
      lexical: { method: 'fts', higherIsBetter: true, approximate: false },
      vector: { method: 'ann', higherIsBetter: false, approximate: true },
    };

    const search = vi.fn(async () => ({
      mode: 'hybrid',
      ranking: { method: 'rrf', higherIsBetter: true, approximate: true, components },
      hits: [
        {
          doc: { id: 1, title: 'stored' },
          score: 0.03,
          components: { lexical: null, vector: { rank: 2, score: 0.4 } },
        },
      ],
    }));

    const payload = {} as Payload;

    registerFrogBotInstance(payload, { search } as unknown as FrogBot, sanitized);

    const schema = new GraphQL.GraphQLSchema({
      query: new GraphQL.GraphQLObjectType({ name: 'Query', fields: queries as never }),
    });

    const result = await GraphQL.graphql({
      schema,
      source:
        '{ searchArticles(index: "titles", text: "hello", vector: [1, 0], candidates: 250) { ranking { method components { lexical { method } vector { method higherIsBetter approximate } } } hits { score components { lexical { rank score } vector { rank score } } } } }',
      contextValue: { req: { payload, context: {}, user: { id: 1 } } },
    });

    expect(result).toEqual({
      data: {
        searchArticles: {
          ranking: {
            method: 'rrf',
            components: {
              lexical: { method: 'fts' },
              vector: { method: 'ann', higherIsBetter: false, approximate: true },
            },
          },
          hits: [{ score: 0.03, components: { lexical: null, vector: { rank: 2, score: 0.4 } } }],
        },
      },
    });
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ candidates: 250, query: { text: 'hello', vector: [1, 0] } }),
    );
  });
});

import type { GraphQLExtension, PayloadRequest, TypedLocale, Where } from 'payload';
import { isolateObjectProperty } from 'payload';

import type { CollectionSlug } from '../types/generated.js';
import type { FrogBotRequest } from '../types/request.js';

type SearchQueryArgs = {
  candidates?: number | null;
  draft?: boolean | null;
  fallbackLocale?: TypedLocale | null;
  index: string;
  limit?: number | null;
  locale?: string | null;
  text?: string | null;
  vector?: number[] | null;
  where?: Where | null;
};

function withoutNulls<T extends object>(value: T): { [K in keyof T]: Exclude<T[K], null> } {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null)) as {
    [K in keyof T]: Exclude<T[K], null>;
  };
}

export function buildSearchQueries({
  attachFrogBot,
  collections,
}: {
  attachFrogBot: (req: PayloadRequest) => Promise<FrogBotRequest>;
  collections: string[];
}): GraphQLExtension {
  return (graphQL, { collections: graphQLCollections, types }) => {
    const {
      GraphQLBoolean,
      GraphQLEnumType,
      GraphQLFloat,
      GraphQLInt,
      GraphQLList,
      GraphQLNonNull,
      GraphQLObjectType,
      GraphQLString,
    } = graphQL;

    const mode = new GraphQLEnumType({
      name: 'SearchMode',
      values: { hybrid: {}, lexical: {}, vector: {} },
    });

    const rankingFields = {
      approximate: { type: new GraphQLNonNull(GraphQLBoolean) },
      higherIsBetter: { type: new GraphQLNonNull(GraphQLBoolean) },
      method: { type: new GraphQLNonNull(GraphQLString) },
    };

    const componentRanking = new GraphQLObjectType({
      name: 'SearchComponentRanking',
      fields: rankingFields,
    });

    const ranking = new GraphQLObjectType({
      name: 'SearchRanking',
      fields: {
        ...rankingFields,
        components: {
          type: new GraphQLObjectType({
            name: 'SearchRankingComponents',
            fields: {
              lexical: { type: new GraphQLNonNull(componentRanking) },
              vector: { type: new GraphQLNonNull(componentRanking) },
            },
          }),
        },
      },
    });

    const hitComponent = new GraphQLObjectType({
      name: 'SearchHitComponent',
      fields: {
        rank: { type: new GraphQLNonNull(GraphQLInt) },
        score: { type: new GraphQLNonNull(GraphQLFloat) },
      },
    });

    const hitComponents = new GraphQLObjectType({
      name: 'SearchHitComponents',
      fields: {
        lexical: { type: hitComponent },
        vector: { type: hitComponent },
      },
    });

    const queries: Record<string, unknown> = {};

    for (const slug of collections) {
      const collection = graphQLCollections[slug];
      const settings = collection?.config.graphQL;

      if (!collection?.graphQL || (typeof settings === 'object' && settings.disableQueries)) {
        continue;
      }

      const name = `search${collection.graphQL.paginatedType.name}`;

      const hit = new GraphQLObjectType({
        name: `${name}Hit`,
        fields: {
          components: { type: hitComponents },
          doc: { type: new GraphQLNonNull(collection.graphQL.type) },
          score: { type: new GraphQLNonNull(GraphQLFloat) },
        },
      });

      const result = new GraphQLObjectType({
        name,
        fields: {
          hits: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(hit))) },
          mode: { type: new GraphQLNonNull(mode) },
          ranking: { type: new GraphQLNonNull(ranking) },
        },
      });

      queries[name] = {
        type: new GraphQLNonNull(result),
        args: {
          candidates: { type: GraphQLInt },
          draft: { type: GraphQLBoolean },
          index: { type: new GraphQLNonNull(GraphQLString) },
          limit: { type: GraphQLInt },
          text: { type: GraphQLString },
          vector: { type: new GraphQLList(new GraphQLNonNull(GraphQLFloat)) },
          where: { type: collection.graphQL.whereInputType },
          ...(types.localeInputType ? { locale: { type: types.localeInputType } } : {}),
          ...(types.fallbackLocaleInputType
            ? { fallbackLocale: { type: types.fallbackLocaleInputType } }
            : {}),
        },
        resolve: async (
          _source: unknown,
          args: SearchQueryArgs,
          context: { req: PayloadRequest },
        ) => {
          const { index, text, vector, ...options } = withoutNulls(args);

          const req = isolateObjectProperty(await attachFrogBot(context.req), [
            'fallbackLocale',
            'locale',
            'transactionID',
          ]);

          return req.frogbot.search({
            ...options,
            collection: slug as CollectionSlug,
            index,
            query: { text, vector },
            overrideAccess: false,
            req,
          });
        },
      };
    }

    return queries;
  };
}

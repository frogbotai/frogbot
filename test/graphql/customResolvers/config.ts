import { buildPaginatedListType } from '@frogbotai/graphql/types';
import type { CollectionConfig, FrogBotRequest } from 'frogbot';

import { buildTestConfig, openAccess } from '../../__helpers/shared/buildTestConfig.js';
import { chatsSlug, usersSlug } from '../shared.js';

export const notesSlug = 'notes';

export const seenFrogBot: { endpoint?: unknown; resolver?: unknown } = {};

type ResolverContext = { req: FrogBotRequest };

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [],
};

const Chats: CollectionConfig = {
  slug: chatsSlug,
  chat: true,
  fields: [],
};

const Notes: CollectionConfig = {
  slug: notesSlug,
  access: { ...openAccess, create: ({ req }) => Boolean(req.user) },
  fields: [{ name: 'title', type: 'text' }],
};

export default await buildTestConfig({
  collections: [Users, Chats, Notes],
  endpoints: [
    {
      path: '/frogbot-identity',
      method: 'get',
      handler: (req) => {
        seenFrogBot.endpoint = req.frogbot;

        return Response.json({ ok: true });
      },
    },
  ],
  graphQL: {
    queries: (GraphQL, context) => ({
      defaultQuery: { type: GraphQL.GraphQLString },
      RecentUsers: {
        args: {},
        resolve: (_obj: unknown, _args: unknown, { req }: ResolverContext) =>
          req.frogbot.find({
            collection: usersSlug,
            depth: 0,
            limit: 10,
            overrideAccess: false,
            req,
            sort: '-createdAt',
          }),
        type: buildPaginatedListType('RecentUsers', context.collections[usersSlug].graphQL!.type),
      },
      nestedContext: {
        type: new GraphQL.GraphQLObjectType({
          name: 'CustomResolverContext',
          fields: {
            label: { type: GraphQL.GraphQLString },
            sameInstance: {
              type: GraphQL.GraphQLBoolean,
              resolve: (source: { instance: unknown }, _args: unknown, { req }: ResolverContext) =>
                req.frogbot === source.instance,
            },
            chatTitles: {
              type: new GraphQL.GraphQLList(GraphQL.GraphQLString),
              resolve: async (_source: unknown, _args: unknown, { req }: ResolverContext) => {
                const { docs } = await req.frogbot.find({
                  collection: chatsSlug,
                  overrideAccess: false,
                  req,
                });

                return docs.map(({ title }) => title);
              },
            },
          },
        }),
        resolve: (_source: unknown, _args: unknown, { req }: ResolverContext) => ({
          instance: req.frogbot,
          label: 'Default field resolver',
        }),
      },
      resolverFailure: {
        type: GraphQL.GraphQLString,
        resolve: (_source: unknown, _args: unknown, { req }: ResolverContext) => {
          seenFrogBot.resolver = req.frogbot;

          throw new Error('Custom query failed');
        },
      },
      myChatTitles: {
        type: new GraphQL.GraphQLList(GraphQL.GraphQLString),
        resolve: async (_source: unknown, _args: unknown, { req }: ResolverContext) => {
          seenFrogBot.resolver = req.frogbot;

          const { docs } = await req.frogbot.find({
            collection: chatsSlug,
            overrideAccess: false,
            req,
          });

          return docs.map(({ title }) => title);
        },
      },
    }),
    mutations: (GraphQL) => ({
      mutationFailure: {
        type: GraphQL.GraphQLString,
        resolve: async (_source: unknown, _args: unknown, { req }: ResolverContext) => {
          seenFrogBot.resolver = req.frogbot;

          throw new Error('Custom mutation failed');
        },
      },
      addNote: {
        type: GraphQL.GraphQLString,
        args: { title: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) } },
        resolve: async (
          _source: unknown,
          { title }: { title: string },
          { req }: ResolverContext,
        ) => {
          const note = await req.frogbot.create({
            collection: notesSlug,
            data: { title },
            overrideAccess: false,
            req,
          });

          return String(note.id);
        },
      },
    }),
  },
});

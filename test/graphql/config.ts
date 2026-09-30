import type { CollectionConfig, FrogBotRequest } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { allowedOrigin, chatsSlug, postsSlug, requestContextSlug, usersSlug } from './shared.js';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
};

const Posts: CollectionConfig = {
  slug: postsSlug,
  access: openAccess,
  fields: [
    { name: 'title', type: 'text' },
    { name: 'body', type: 'textarea' },
  ],
  search: {
    content: {
      lexical: { fields: ['title', 'body'] },
    },
  },
};

const Chats: CollectionConfig = {
  slug: chatsSlug,
  chat: true,
  fields: [],
};

const RequestContext: CollectionConfig = {
  slug: requestContextSlug,
  access: {
    ...openAccess,
    read: ({ req }) => Object.hasOwn(req.frogbot.collections, postsSlug),
  },
  fields: [{ name: 'label', type: 'text' }],
};

export default await buildTestConfig({
  collections: [Users, Posts, Chats, RequestContext],
  cors: [allowedOrigin],
  graphQL: {
    queries: (GraphQL) => ({
      postTotal: {
        type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLInt),
        resolve: async (_source: unknown, _args: unknown, { req }: { req: FrogBotRequest }) => {
          const { totalDocs } = await req.frogbot.count({ collection: postsSlug, req });

          return totalDocs;
        },
      },
    }),
  },
});

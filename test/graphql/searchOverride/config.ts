import type { FrogBotRequest } from 'frogbot';

import { buildTestConfig, openAccess } from '../../__helpers/shared/buildTestConfig.js';
import { postsSlug, usersSlug } from '../shared.js';

export default await buildTestConfig({
  collections: [
    { slug: usersSlug, auth: true, access: openAccess, fields: [] },
    {
      slug: postsSlug,
      access: openAccess,
      fields: [{ name: 'title', type: 'text' }],
      search: { content: { lexical: { fields: ['title'] } } },
    },
  ],
  graphQL: {
    queries: (GraphQL) => ({
      searchPosts: {
        type: GraphQL.GraphQLString,
        resolve: async (_source: unknown, _args: unknown, { req }: { req: FrogBotRequest }) => {
          const { totalDocs } = await req.frogbot.count({
            collection: postsSlug,
            overrideAccess: false,
            req,
          });

          return `Custom search: ${totalDocs}`;
        },
      },
    }),
    mutations: (GraphQL) => ({
      addPost: {
        type: GraphQL.GraphQLString,
        resolve: async (_source: unknown, _args: unknown, { req }: { req: FrogBotRequest }) => {
          const post = await req.frogbot.create({
            collection: postsSlug,
            data: { title: 'From a search-enabled custom mutation' },
            overrideAccess: false,
            req,
          });

          return String(post.id);
        },
      },
    }),
  },
});

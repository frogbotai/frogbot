import { buildTestConfig } from '../../__helpers/shared/buildTestConfig.js';
import { usersSlug } from '../shared.js';

export const resolverCalls = { queries: 0, mutations: 0 };

export default await buildTestConfig({
  collections: [{ slug: usersSlug, auth: true, fields: [] }],
  graphQL: {
    disable: true,
    queries: (GraphQL) => ({
      disabledQuery: {
        type: GraphQL.GraphQLBoolean,
        resolve: () => {
          resolverCalls.queries += 1;

          return true;
        },
      },
    }),
    mutations: (GraphQL) => ({
      disabledMutation: {
        type: GraphQL.GraphQLBoolean,
        resolve: () => {
          resolverCalls.mutations += 1;

          return true;
        },
      },
    }),
  },
});

import type { AuthStrategyFunctionArgs, CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import {
  brokenHeader,
  brokenStrategyName,
  headerTokenStrategyName,
  strategyFailureMessage,
  strategyHeader,
  tokenHeader,
  usersSlug,
} from './shared.js';

export const strategyCalls: Array<
  AuthStrategyFunctionArgs & { requestFrogBot: AuthStrategyFunctionArgs['frogbot'] | undefined }
> = [];

const Users: CollectionConfig = {
  slug: usersSlug,
  access: openAccess,
  auth: {
    disableLocalStrategy: true,
    strategies: [
      {
        name: brokenStrategyName,
        authenticate: ({ headers }) => {
          if (headers.has(brokenHeader)) {
            throw new Error(strategyFailureMessage);
          }

          return { user: null };
        },
      },
      {
        name: headerTokenStrategyName,
        authenticate: async (args) => {
          strategyCalls.push({ ...args, requestFrogBot: args.req?.frogbot });

          const { frogbot, headers } = args;
          const code = headers.get(tokenHeader);

          if (!code) {
            return { user: null };
          }

          const { docs } = await frogbot.find({
            collection: usersSlug,
            where: { code: { equals: code } },
          });

          return {
            responseHeaders: new Headers({ [strategyHeader]: headerTokenStrategyName }),
            user: docs[0] ? { ...docs[0], collection: usersSlug } : null,
          };
        },
      },
    ],
  },
  fields: [
    { name: 'email', type: 'text' },
    { name: 'code', type: 'text' },
  ],
};

export default await buildTestConfig({ collections: [Users] });

import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { mcpPlugin } from '@frogbotai/plugin-mcp';
import { rolesPlugin } from '@frogbotai/plugin-roles';
import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';

export const usersSlug = 'users';
export const postsSlug = 'posts';
export const apiKeysSlug = 'api-keys';
export const mcpEndpoint = '/api/mcp';
export const apiKeyToken = `fb_${'A'.repeat(43)}`;
export const unknownApiKeyToken = `fb_${'B'.repeat(43)}`;
export const apiKeyHeader = 'x-api-key';
export const customStrategyHeader = 'x-mcp-custom-actor';
export const customStrategyName = 'mcp-custom-actor';
export const actorToolName = 'getMcpActor';
export const strategyFailureMessage = 'API-key storage unavailable: secret database credentials';
export const testCredentials = {
  email: 'mcp-key-owner@frogbot.local',
  password: 'frogbot-test-password',
};

export const customActorCredentials = {
  email: 'mcp-custom-actor@frogbot.local',
  password: 'frogbot-test-password',
};

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: {
    strategies: [
      {
        name: customStrategyName,
        authenticate: async ({ frogbot, headers }) => {
          if (headers.get(customStrategyHeader) !== customActorCredentials.email) {
            return { user: null };
          }

          const { docs } = await frogbot.find({
            collection: usersSlug,
            limit: 1,
            overrideAccess: true,
            where: { email: { equals: customActorCredentials.email } },
          });

          return {
            user: docs[0]
              ? { ...docs[0], collection: usersSlug, _strategy: customStrategyName }
              : null,
          };
        },
      },
    ],
  },
  access: openAccess,
  fields: [],
};

const Posts: CollectionConfig = {
  slug: postsSlug,
  access: openAccess,
  fields: [{ name: 'title', type: 'text' }],
};

export default await buildTestConfig({
  collections: [Users, Posts],
  plugins: [
    rolesPlugin(),
    apiKeysPlugin({ authCollection: usersSlug, collectionSlug: apiKeysSlug }),
    mcpPlugin({
      collections: { [postsSlug]: { enabled: { find: true } } },
      mcp: {
        tools: [
          {
            name: actorToolName,
            description: 'Returns the authenticated MCP actor.',
            parameters: {},
            handler: (_args, req) => ({
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    id: req.user?.id,
                    email: req.user?.email,
                    collection: req.user?.collection,
                    strategy: req.user?._strategy,
                    apiKeyId: req.user?.apiKeyId,
                  }),
                },
              ],
            }),
          },
        ],
      },
    }),
  ],
});

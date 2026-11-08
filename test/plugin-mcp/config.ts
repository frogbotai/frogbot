import { createMathHelper } from '@frogbotai/piece-math-helper';
import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { mcpPlugin } from '@frogbotai/plugin-mcp';
import { rolesPlugin } from '@frogbotai/plugin-roles';
import {
  autonumberField,
  type CollectionConfig,
  durationField,
  moneyField,
  ratingField,
  type Tool,
} from 'frogbot';
import { write_todos } from 'frogbot/tools';
import { z } from 'zod';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';

export const usersSlug = 'users';
export const postsSlug = 'posts';
export const ticketsSlug = 'tickets';
export const secretsSlug = 'secrets';
export const membersSlug = 'members';
export const staffNotesSlug = 'staff-notes';
export const apiKeysSlug = 'api-keys';
export const mcpEndpoint = '/api/mcp';
export const apiKeyToken = `fb_${'A'.repeat(43)}`;
export const unknownApiKeyToken = `fb_${'B'.repeat(43)}`;
export const apiKeyHeader = 'x-api-key';
export const customStrategyHeader = 'x-mcp-custom-actor';
export const customStrategyName = 'mcp-custom-actor';
export const actorToolName = 'getMcpActor';
export const restrictedToolName = 'getMcpSecret';
export const staffToolName = 'getStaffSecret';
export const memberHeader = 'x-mcp-member';
export const memberStrategyName = 'mcp-member';
export const customActorApiKeyToken = `fb_${'C'.repeat(43)}`;
export const resourceMetadataURL = 'https://app.example.com/.well-known/oauth-protected-resource';
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

export const memberCredentials = {
  email: 'mcp-member@frogbot.local',
  password: 'frogbot-test-password',
};

const Members: CollectionConfig = {
  slug: membersSlug,
  auth: {
    strategies: [
      {
        name: memberStrategyName,
        authenticate: async ({ frogbot, headers }) => {
          if (headers.get(memberHeader) !== memberCredentials.email) return { user: null };

          const { docs } = await frogbot.find({
            collection: membersSlug,
            limit: 1,
            overrideAccess: true,
            where: { email: { equals: memberCredentials.email } },
          });

          return { user: docs[0] ? { id: docs[0].id, email: docs[0].email } : null };
        },
      },
    ],
  },
  access: openAccess,
  fields: [],
};

const StaffNotes: CollectionConfig = {
  slug: staffNotesSlug,
  access: { ...openAccess, read: ({ req }) => req.user?.collection === usersSlug },
  fields: [{ name: 'title', type: 'text' }],
};

const Posts: CollectionConfig = {
  slug: postsSlug,
  access: openAccess,
  fields: [
    { name: 'title', type: 'text' },
    moneyField({ name: 'price', min: 0, admin: { description: 'Retail price' } }),
    {
      name: 'cost',
      type: 'group',
      fields: [moneyField({ name: 'wholesale', currency: 'EUR' })],
    },
    ratingField({ name: 'score' }),
    durationField({ name: 'timeSpent' }),
  ],
};

const Secrets: CollectionConfig = {
  slug: secretsSlug,
  access: { ...openAccess, read: () => false },
  fields: [{ name: 'title', type: 'text' }],
};

const Tickets: CollectionConfig = {
  slug: ticketsSlug,
  access: openAccess,
  fields: [{ name: 'title', type: 'text' }, autonumberField({ name: 'number' })],
};

const getMcpActor: Tool = {
  slug: actorToolName,
  description: 'Returns the authenticated MCP actor.',
  annotations: { readOnlyHint: true, idempotentHint: true },
  inputSchema: z.object({}),
  execute: (_input, { req }) => ({
    id: req.user?.id,
    email: req.user?.email,
    collection: req.user?.collection,
    strategy: req.user && '_strategy' in req.user ? req.user._strategy : undefined,
    apiKeyId: req.user && 'apiKeyId' in req.user ? req.user.apiKeyId : undefined,
  }),
};

const getStaffSecret: Tool = {
  slug: staffToolName,
  description: 'Returns a secret only users may read.',
  inputSchema: z.object({}),
  access: ({ req }) => req.user?.collection === usersSlug,
  execute: () => 'the staff secret',
};

const getMcpSecret: Tool = {
  slug: restrictedToolName,
  description: 'Returns a secret only the custom actor may read.',
  inputSchema: z.object({}),
  access: ({ req }) => req.user?.email === customActorCredentials.email,
  execute: () => 'the secret',
};

export default await buildTestConfig({
  admin: { user: usersSlug },
  collections: [Users, Members, Posts, Tickets, Secrets, StaffNotes],
  plugins: [
    rolesPlugin(),
    apiKeysPlugin({ authCollection: usersSlug, collectionSlug: apiKeysSlug }),
    mcpPlugin({
      resourceMetadataURL,
      tools: [
        getMcpActor,
        getMcpSecret,
        getStaffSecret,
        { ...createMathHelper().addNumbers, annotations: { readOnlyHint: true } },
        write_todos,
      ],
    }),
  ],
});

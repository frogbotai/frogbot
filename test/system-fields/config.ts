import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { importExportPlugin } from '@frogbotai/plugin-import-export';
import type { CollectionConfig, FrogBotConfig, Tool } from 'frogbot';
import { autonumberField, autonumberKeyField } from 'frogbot';
import { z } from 'zod';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { getCurrentDatabaseAdapter } from '../__helpers/shared/db/dbAdapters.js';
import {
  adminsSlug,
  agentSlug,
  chatsSlug,
  createTicketToolSlug,
  databasePath,
  hiddenIssueTitle,
  importsDir,
  issuesSlug,
  modelPort,
  projectsSlug,
  ticketsSlug,
  touchTicketTaskSlug,
  usersSlug,
} from './shared.js';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
};

const Admins: CollectionConfig = {
  slug: adminsSlug,
  auth: true,
  access: openAccess,
  fields: [],
};

const Tickets: CollectionConfig = {
  slug: ticketsSlug,
  access: openAccess,
  versions: { drafts: { autosave: true } },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'assignee', type: 'relationship', relationTo: usersSlug },
    autonumberField({ name: 'number', label: 'Ticket #' }),
    {
      name: 'details',
      type: 'group',
      fields: [autonumberField({ name: 'ref' }), { name: 'note', type: 'text' }],
    },
  ],
};

const Projects: CollectionConfig = {
  slug: projectsSlug,
  access: openAccess,
  fields: [{ name: 'key', type: 'text', required: true, unique: true }],
};

const Issues: CollectionConfig = {
  slug: issuesSlug,
  access: { ...openAccess, read: () => ({ title: { not_equals: hiddenIssueTitle } }) },
  admin: { useAsTitle: 'key' },
  versions: true,
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'project', type: 'relationship', relationTo: projectsSlug, required: true },
    autonumberField({ name: 'number', scope: 'project' }),
    autonumberKeyField({ name: 'key', number: 'number', prefix: 'key' }),
  ],
  ...(getCurrentDatabaseAdapter() === 'mongodb'
    ? {}
    : { search: { keys: { lexical: { fields: ['key', 'title'] } } } }),
};

const Chats: CollectionConfig = {
  slug: chatsSlug,
  chat: true,
  fields: [],
};

const createTicketInput = z.object({ title: z.string() });

const createTicket: Tool<typeof createTicketInput> = {
  slug: createTicketToolSlug,
  description: 'Create a ticket.',
  inputSchema: createTicketInput,
  execute: async ({ title }, { frogbot, req }) => {
    const ticket = await frogbot.create({
      collection: ticketsSlug,
      data: { title },
      req,
      overrideAccess: true,
    });

    return { id: ticket.id };
  },
};

const useTemporaryUploadDir: NonNullable<
  Parameters<typeof importExportPlugin>[0]['overrideImportCollection']
> = ({ collection }) => ({
  ...collection,
  upload: {
    ...(typeof collection.upload === 'object' && collection.upload),
    staticDir: importsDir,
  },
});

export function buildTicketsConfig({ db, onInit }: Pick<FrogBotConfig, 'db' | 'onInit'>) {
  return buildTestConfig({
    db,
    onInit,
    admin: { user: usersSlug },
    collections: [Users, Admins, Tickets, Projects, Issues],
  });
}

export function buildSystemFieldsConfig({ db }: { db?: FrogBotConfig['db'] }) {
  return buildTestConfig({
    ...(db && { db }),
    admin: { user: usersSlug },
    collections: [Users, Admins, Tickets, Projects, Issues, Chats],
    ai: {
      defaultModel: 'test/gpt-4.1-mini',
      providers: {
        test: {
          type: 'openai-compatible',
          baseUrl: `http://127.0.0.1:${modelPort}/v1`,
          apiKey: 'test-key',
          models: [{ id: 'gpt-4.1-mini', mode: 'chat' }],
        },
      },
    },
    agents: [
      {
        slug: agentSlug,
        model: 'test/gpt-4.1-mini',
        instructions: 'Manage tickets.',
        access: () => true,
        tools: [createTicket],
      },
    ],
    jobs: {
      tasks: [
        {
          slug: touchTicketTaskSlug,
          inputSchema: [
            { name: 'ticket', type: 'text', required: true },
            { name: 'title', type: 'text', required: true },
          ],
          handler: async ({ input, req }) => {
            await req.payload.update({
              collection: ticketsSlug,
              id: input.ticket,
              data: { title: input.title },
              req,
              overrideAccess: true,
            });

            return { output: {} };
          },
        },
      ],
    },
    plugins: [
      apiKeysPlugin({ authCollection: usersSlug }),
      importExportPlugin({
        collections: [{ slug: ticketsSlug }],
        overrideExportCollection: useTemporaryUploadDir,
        overrideImportCollection: useTemporaryUploadDir,
      }),
    ],
  });
}

const isSQLite = getCurrentDatabaseAdapter() === 'sqlite';

export default await buildSystemFieldsConfig({
  db: isSQLite ? sqliteAdapter({ client: { url: `file:${databasePath}` } }) : undefined,
});

import { importExportPlugin } from '@frogbotai/plugin-import-export';
import type { CollectionConfig, FrogBotConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import {
  brokenCompanyMessage,
  brokenCompanyName,
  companiesSlug,
  contactsSlug,
  hiddenCompanyName,
  importsDir,
  notesHookCalls,
  notesSlug,
  tagsSlug,
  usersSlug,
} from './shared.js';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [],
};

const Companies: CollectionConfig = {
  slug: companiesSlug,
  admin: { useAsTitle: 'name' },
  access: {
    ...openAccess,
    read: ({ req }) => Boolean(req.user) && { name: { not_equals: hiddenCompanyName } },
    create: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      validate: (value: unknown) => value !== brokenCompanyName || brokenCompanyMessage,
    },
    { name: 'domain', type: 'text' },
  ],
};

const Tags: CollectionConfig = {
  slug: tagsSlug,
  admin: { useAsTitle: 'name' },
  access: openAccess,
  fields: [{ name: 'name', type: 'text', required: true }],
};

const Contacts: CollectionConfig = {
  slug: contactsSlug,
  access: openAccess,
  fields: [
    { name: 'name', type: 'text' },
    { name: 'email', type: 'email' },
    { name: 'first_name', type: 'text' },
    { name: 'company', type: 'relationship', relationTo: companiesSlug },
    { name: 'tags', type: 'relationship', relationTo: tagsSlug, hasMany: true },
    { name: 'details', type: 'group', fields: [{ name: 'city', type: 'text' }] },
  ],
};

const Notes: CollectionConfig = {
  slug: notesSlug,
  access: openAccess,
  fields: [
    { name: 'title', type: 'text' },
    { name: 'company', type: 'relationship', relationTo: companiesSlug },
  ],
};

/** The suite's config; the AI suggestion suite adds an `ai` config. */
export function buildImportConfig({ ai }: Pick<FrogBotConfig, 'ai'> = {}) {
  return buildTestConfig({
    ...(ai && { ai }),
    admin: { user: usersSlug },
    collections: [Users, Companies, Tags, Contacts, Notes],
    plugins: [
      importExportPlugin({
        collections: [
          { slug: companiesSlug },
          { slug: tagsSlug },
          { slug: contactsSlug },
          {
            slug: notesSlug,
            export: { disableJobsQueue: true },
            import: {
              disableJobsQueue: true,
              hooks: {
                before: ({ data }) => {
                  notesHookCalls.push(data);

                  return data;
                },
              },
            },
          },
        ],
        overrideImportCollection: ({ collection }) => ({
          ...collection,
          access: {
            ...collection.access,
            read: ({ req }) => Boolean(req.user) && { 'createdBy.value': { equals: req.user?.id } },
          },
          upload: {
            ...(typeof collection.upload === 'object' && collection.upload),
            staticDir: importsDir,
          },
        }),
      }),
    ],
  });
}

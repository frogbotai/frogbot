import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { databasePath, postsSlug, usersSlug } from './shared.js';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text', required: true }],
};

const Posts: CollectionConfig = {
  slug: postsSlug,
  versions: true,
  access: {
    create: () => true,
    delete: ({ req }) => ({ owner: { equals: req.user?.id } }),
    read: ({ req }) => ({ owner: { equals: req.user?.id } }),
    update: ({ req }) => ({ owner: { equals: req.user?.id } }),
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'body', type: 'textarea' },
    {
      name: 'details',
      type: 'group',
      fields: [
        { name: 'summary', type: 'text' },
        { name: 'budget', type: 'number' },
      ],
    },
    { name: 'owner', type: 'relationship', relationTo: usersSlug, required: true },
    { name: 'secret', type: 'text', access: { read: () => false } },
  ],
};

export default await buildTestConfig({
  collections: [Users, Posts],
  db: sqliteAdapter({
    client: { url: `file:${databasePath}` },
    transactionOptions: {},
  }),
});

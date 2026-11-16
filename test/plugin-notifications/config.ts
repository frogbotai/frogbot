import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { commentsField, commentsPlugin } from '@frogbotai/plugin-comments';
import { notificationsPlugin } from '@frogbotai/plugin-notifications';
import { lexicalEditor } from '@frogbotai/richtext-lexical';
import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { getCurrentDatabaseAdapter } from '../__helpers/shared/db/dbAdapters.js';

const Users: CollectionConfig = {
  slug: 'users',
  admin: { useAsTitle: 'name' },
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
};

const Deals: CollectionConfig = {
  slug: 'deals',
  access: {
    ...openAccess,
    read: ({ req }) => Boolean(req.user && req.user.email !== 'blocked@frogbot.local'),
  },
  fields: [{ name: 'name', type: 'text' }, commentsField()],
};

export default await buildTestConfig({
  ...(getCurrentDatabaseAdapter() === 'sqlite'
    ? {
        db: sqliteAdapter({
          client: {
            url: process.env.SQLITE_URL || process.env.DATABASE_URL || 'file:./test-payload.db',
          },
          transactionOptions: {},
        }),
      }
    : {}),
  editor: lexicalEditor(),
  admin: { user: 'users' },
  collections: [Users, Deals],
  plugins: [
    commentsPlugin(),
    notificationsPlugin({
      overrides: {
        fields: ({ defaultFields }) => [...defaultFields, { name: 'archivedAt', type: 'date' }],
      },
    }),
  ],
});

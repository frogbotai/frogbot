import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { auditLogPlugin } from '@frogbotai/plugin-audit-log';
import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { getCurrentDatabaseAdapter } from '../__helpers/shared/db/dbAdapters.js';

const Accounts: CollectionConfig = {
  slug: 'accounts',
  auth: true,
  access: openAccess,
  fields: [],
};

const Posts: CollectionConfig = {
  slug: 'posts',
  access: openAccess,
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'optional', type: 'text' },
    { name: 'secret', type: 'text', hidden: true },
    {
      name: 'meta',
      type: 'group',
      fields: [
        { name: 'token', type: 'text', hidden: true },
        { name: 'note', type: 'text' },
      ],
    },
  ],
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
  collections: [Accounts, Posts],
  plugins: [
    apiKeysPlugin({
      authCollection: 'accounts',
      collectionSlug: 'credentials',
      tokenPrefix: 'test',
      headerNames: ['x-service-key'],
    }),
    auditLogPlugin({
      collections: ['posts', 'accounts'],
      retention: { days: 30 },
      snapshot: 'delete',
    }),
  ],
});

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { auditLogPlugin, type AuditOperation } from '@frogbotai/plugin-audit-log';
import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { getCurrentDatabaseAdapter } from '../__helpers/shared/db/dbAdapters.js';

const Accounts: CollectionConfig = {
  slug: 'accounts',
  auth: true,
  access: openAccess,
  fields: [],
};

const Vault: CollectionConfig = {
  slug: 'vault',
  access: openAccess,
  fields: [
    { name: 'name', type: 'text' },
    { name: 'vaultSecret', type: 'text', hidden: true },
  ],
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
    { name: 'author', type: 'relationship', relationTo: 'accounts' },
    { name: 'vaultRef', type: 'relationship', relationTo: 'vault' },
  ],
};

const Ledgers: CollectionConfig = {
  slug: 'ledgers',
  access: {
    ...openAccess,
    read: ({ req }) => Boolean(req.user && req.user.email !== 'blocked@frogbot.local'),
  },
  fields: [
    { name: 'title', type: 'text' },
    {
      name: 'cost',
      type: 'number',
      access: { read: ({ req }) => req.user?.email === 'audit@frogbot.local' },
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
  collections: [Accounts, Posts, Vault, Ledgers],
  plugins: [
    apiKeysPlugin({
      authCollection: 'accounts',
      collectionSlug: 'credentials',
      tokenPrefix: 'test',
      headerNames: ['x-service-key'],
    }),
    auditLogPlugin({
      collections: ['posts', 'accounts', 'ledgers'],
      retention: { days: 30 },
      snapshot: 'delete',
      entry: ({ entry, doc, operation }) =>
        doc.title === `BAD ${operation}`
          ? { ...entry, operation: 'bogus' as AuditOperation }
          : entry,
    }),
  ],
});

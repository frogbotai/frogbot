import os from 'node:os';
import path from 'node:path';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { auditLogPlugin } from '@frogbotai/plugin-audit-log';
import { commentFeatures, commentsField, commentsPlugin } from '@frogbotai/plugin-comments';
import { lexicalEditor, UploadFeature } from '@frogbotai/richtext-lexical';
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

const Media: CollectionConfig = {
  slug: 'media',
  access: openAccess,
  upload: { staticDir: path.join(os.tmpdir(), 'frogbot-plugin-comments-int') },
  fields: [],
};

const Deals: CollectionConfig = {
  slug: 'deals',
  versions: true,
  access: {
    ...openAccess,
    read: ({ req }) => Boolean(req.user && req.user.email !== 'blocked@frogbot.local'),
  },
  fields: [
    { name: 'name', type: 'text' },
    commentsField({
      editor: lexicalEditor({ features: [...commentFeatures(), UploadFeature()] }),
    }),
  ],
};

const Tasks: CollectionConfig = {
  slug: 'tasks',
  access: openAccess,
  fields: [{ name: 'title', type: 'text' }],
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
  collections: [Users, Media, Deals, Tasks],
  plugins: [auditLogPlugin({ collections: ['deals'] }), commentsPlugin({ collections: ['tasks'] })],
});

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { formsPlugin } from '@frogbotai/plugin-forms';
import { buildConfig } from 'frogbot';

import { leadsSlug } from '../shared';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET || 'browser-forms-secret',
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL || 'file:./frogbot.db' } }),
  typescript: { autoGenerate: false },
  admin: { importMap: { autoGenerate: false } },
  collections: [
    { slug: 'users', auth: true, fields: [] },
    {
      slug: leadsSlug,
      admin: { useAsTitle: 'email' },
      access: { read: ({ req }) => Boolean(req.user) },
      fields: [
        { name: 'email', type: 'email', required: true },
        { name: 'name', type: 'text' },
        { name: 'interest', type: 'radio', options: ['sales', 'support'] },
        { name: 'source', type: 'text' },
      ],
    },
  ],
  plugins: [formsPlugin({ collections: [leadsSlug] })],
});

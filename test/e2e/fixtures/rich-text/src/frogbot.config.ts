import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { lexicalEditor } from '@frogbotai/richtext-lexical';
import { buildConfig } from 'frogbot';

import { Files, Posts, SchemaMismatch, Users } from './collections';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET ?? 'browser-test-secret',
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL ?? 'file:./rich-text.browser.db' },
  }),
  collections: [Users, Files, Posts, SchemaMismatch],
  editor: lexicalEditor(),
  routes: { admin: '/admin' },
  typescript: { autoGenerate: false },
});

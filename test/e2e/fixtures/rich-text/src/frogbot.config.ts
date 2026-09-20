import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { lexicalEditor } from '@frogbotai/richtext-lexical';
import { buildConfig } from 'frogbot';

import { Posts, Users } from './collections';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET ?? 'browser-test-secret',
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL ?? 'file:./rich-text.browser.db' },
  }),
  collections: [Users, Posts],
  editor: lexicalEditor(),
  routes: { admin: '/admin' },
  typescript: { autoGenerate: false },
});

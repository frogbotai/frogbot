import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { rolesPlugin } from '@frogbotai/plugin-roles';
import { buildConfig } from 'frogbot';

import { notesPlugin } from './plugin-development.js';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL ?? 'file:./frogbot.db' } }),
  collections: [],
  plugins: [rolesPlugin(), notesPlugin()],
});

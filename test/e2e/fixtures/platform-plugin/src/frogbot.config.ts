import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET ?? 'platform-plugin-secret',
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL ?? 'file:./platform-plugin.db' } }),
  collections: [{ slug: 'users', auth: true, fields: [] }],
  typescript: { autoGenerate: false },
});

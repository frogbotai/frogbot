import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';

import { noteFields } from './fields';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET ?? 'service-app-secret',
  db: sqliteAdapter({ client: { url: 'file:./frogbot.db' } }),
  collections: [{ slug: 'notes', fields: noteFields }],
  typescript: { autoGenerate: false },
});

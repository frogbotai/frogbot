import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';
import type { FrogbotConfig } from 'frogbot';

import { assistant } from './agents';
import { Users } from './collections';

const config: FrogbotConfig = {
  secret: process.env.FROGBOT_SECRET ?? 'dev-secret-change-me',
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL ?? 'file:./frogbot.db' },
  }),
  collections: [Users],
  ai: {
    providers: {
      openai: true,
    },
  },
  agents: [assistant],
};

export default buildConfig(config);

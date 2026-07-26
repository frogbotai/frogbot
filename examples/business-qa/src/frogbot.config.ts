import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { oauthPlugin } from '@frogbotai/plugin-oauth';
import { buildConfig } from 'frogbot';
import type { FrogbotConfig } from 'frogbot';

import { qaAnalyst, releaseManager } from './agents';
import { Connections, Media, Releases, Users } from './collections';
import { pieces } from './pieces';

const config: FrogbotConfig = {
  secret: process.env.FROGBOT_SECRET ?? 'dev-secret-change-me',
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL ?? 'file:./frogbot.db'
    }
  }),
  collections: [
    Users,
    Media,
    Releases,
    Connections
  ],
  pieces,
  ai: {
    providers: { openai: true }
  },
  agents: [
    qaAnalyst,
    releaseManager
  ],
  plugins: [
    apiKeysPlugin({ collection: { admin: { group: 'Security' } } }),
    oauthPlugin(),
  ],
};

export default buildConfig(config);

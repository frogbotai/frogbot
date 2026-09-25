import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { rolesPlugin } from '@frogbotai/plugin-roles';
import type { FrogBotConfig } from 'frogbot';
import { buildConfig } from 'frogbot';

import { qaAnalyst, releaseManager } from './agents';
import { Media, Releases, Users } from './collections';
import { googleConnections, linear, pieces } from './pieces';

const config: FrogBotConfig = {
  secret: process.env.FROGBOT_SECRET ?? 'dev-secret-change-me',
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL ?? 'file:./frogbot.db',
    },
  }),
  collections: [Users, Media, Releases],
  pieces,
  connections: [...googleConnections, { piece: linear, secret: true }],
  ai: {
    providers: { openai: true },
  },
  agents: [qaAnalyst, releaseManager],
  plugins: [
    rolesPlugin(),
    apiKeysPlugin({ collection: { admin: { group: 'Security' } } }),
  ],
};

export default buildConfig(config);

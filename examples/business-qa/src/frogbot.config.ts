import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { aiPolicyPlugin } from '@frogbotai/plugin-ai-policy';
import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { rolesPlugin } from '@frogbotai/plugin-roles';
import { sharpTransformer } from '@frogbotai/transformer-sharp';
import type { FrogBotConfig } from 'frogbot';
import { buildConfig } from 'frogbot';

import { qaAnalyst, releaseManager } from './agents';
import { Media } from './collections/Media';
import { Releases } from './collections/Releases';
import { Users } from './collections/Users';
import { googleConnections, linear } from './pieces';

const config: FrogBotConfig = {
  secret: process.env.FROGBOT_SECRET ?? 'dev-secret-change-me',
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL ?? 'file:./frogbot.db',
    },
  }),
  collections: [Users, Media, Releases],
  connections: [...googleConnections, { piece: linear, secret: true }],
  ai: {
    providers: { openai: true },
  },
  agents: [qaAnalyst, releaseManager],
  plugins: [
    aiPolicyPlugin(),
    rolesPlugin(),
    apiKeysPlugin({ collection: { admin: { group: 'Security' } } }),
  ],
  upload: { transformers: [sharpTransformer()] },
};

export default buildConfig(config);

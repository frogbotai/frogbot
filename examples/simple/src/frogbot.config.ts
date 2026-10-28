import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { aiPolicyPlugin } from '@frogbotai/plugin-ai-policy';
import { sharpTransformer } from '@frogbotai/transformer-sharp';
import type { FrogBotConfig } from 'frogbot';
import { buildConfig } from 'frogbot';
import { general } from 'frogbot/agents';

import { Tasks } from './collections/Tasks';
import { Users } from './collections/Users';

const config: FrogBotConfig = {
  secret: process.env.FROGBOT_SECRET ?? 'dev-secret-change-me',
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL ?? 'file:./frogbot.db' },
  }),
  collections: [Users, Tasks],
  ai: {
    defaultModel: 'openai/gpt-4o-mini',
    providers: {
      openai: true,
    },
  },
  agents: [general()],
  plugins: [aiPolicyPlugin()],
  upload: { transformers: [sharpTransformer()] },
};

export default buildConfig(config);

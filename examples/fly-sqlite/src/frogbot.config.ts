import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { aiPolicyPlugin } from '@frogbotai/plugin-ai-policy';
import { sharpTransformer } from '@frogbotai/transformer-sharp';
import type { FrogBotConfig } from 'frogbot';
import { buildConfig } from 'frogbot';
import { todoTools } from 'frogbot/tools';

import { assistant } from './agents';
import { Users } from './collections/Users';
import { migrations } from './migrations';

const config: FrogBotConfig = {
  secret: process.env.FROGBOT_SECRET || '',
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL || '' },
    // In production, FrogBot applies these migrations automatically on boot,
    // creating the schema in a fresh database. In dev, the schema is pushed
    // automatically. When you change collections, run `pnpm migrate:create`.
    prodMigrations: migrations,
  }),
  collections: [Users],
  tools: [...todoTools],
  ai: {
    providers: {
      zen: {
        type: 'openai-compatible',
        baseUrl: 'https://opencode.ai/zen/v1',
        apiKey: 'public',
        models: [{ id: 'big-pickle', mode: 'chat' }],
      },
    },
  },
  agents: [assistant],
  plugins: [aiPolicyPlugin()],
  upload: { transformers: [sharpTransformer()] },
};

export default buildConfig(config);

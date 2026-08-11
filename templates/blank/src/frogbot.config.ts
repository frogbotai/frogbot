import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { FrogbotConfig } from 'frogbot';
import { buildConfig } from 'frogbot';
import { todoTools } from 'frogbot/tools';

import { assistant } from './agents';
import { Users } from './collections';

const config: FrogbotConfig = {
  secret: process.env.FROGBOT_SECRET || '',
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL || '' },
  }),
  collections: [Users],
  tools: [...todoTools],
  ai: {
    providers: {
      zen: {
        type: 'openai-compatible',
        baseUrl: 'https://opencode.ai/zen/v1',
        apiKey: 'public',
        models: [{ id: 'deepseek-v4-flash-free', mode: 'chat' }],
      },
    },
  },
  agents: [assistant],
};

export default buildConfig(config);

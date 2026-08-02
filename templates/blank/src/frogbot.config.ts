import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { FrogbotConfig } from 'frogbot';
import { buildConfig } from 'frogbot';
import { todoTools } from 'frogbot/tools';

import { assistant } from './agents';
import { Users } from './collections';

const config: FrogbotConfig = {
  secret: process.env.FROGBOT_SECRET ?? 'dev-secret-change-me',
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL ?? 'file:./frogbot.db' },
  }),
  collections: [Users],
  tools: [...todoTools],
  ai: {
    providers: process.env.FROGBOT_E2E_ZEN
      ? {
          zen: {
            type: 'openai-compatible',
            baseUrl: 'https://opencode.ai/zen/v1',
            apiKey: 'public',
            models: [{ id: 'deepseek-v4-flash-free', mode: 'chat' }],
          },
        }
      : { openai: true },
    routers: {
      assistant: {
        model: process.env.FROGBOT_MODEL ?? 'openai/gpt-4o-mini',
      },
    },
  },
  agents: [assistant],
};

export default buildConfig(config);

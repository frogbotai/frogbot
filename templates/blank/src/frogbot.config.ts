import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { FrogbotConfig } from 'frogbot';
import { buildConfig } from 'frogbot';
import { general } from 'frogbot/agents';
import { todoTools } from 'frogbot/tools';

import { Users } from './collections';
import { assistant } from './agents/assistant';

const config: FrogbotConfig = {
  secret: process.env.FROGBOT_SECRET || '',
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL || '' },
  }),
  collections: [Users],
  tools: [...todoTools],
  ai: {
    defaultModel: 'bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',
    providers: {
      // zen: {
      //   type: 'openai-compatible',
      //   baseUrl: 'https://opencode.ai/zen/v1',
      //   apiKey: 'public',
      //   models: [{ id: 'big-pickle', mode: 'chat' }],
      // },
      bedrock: {
        region: 'us-east-1',
        models: ['us.anthropic.claude-haiku-4-5-20251001-v1:0'],
      },
    },
  },
  admin: {},
  agents: [general(), assistant],
};

export default buildConfig(config);

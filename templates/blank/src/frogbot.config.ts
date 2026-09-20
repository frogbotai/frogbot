import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { lexicalEditor } from '@frogbotai/richtext-lexical';
import type { FrogbotConfig } from 'frogbot';
import { buildConfig } from 'frogbot';
import { general } from 'frogbot/agents';
import { todoTools } from 'frogbot/tools';

import { assistant } from './agents/assistant';
import { Users } from './collections';

const config: FrogbotConfig = {
  secret: process.env.FROGBOT_SECRET || '',
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL || '' },
  }),
  editor: lexicalEditor(),
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

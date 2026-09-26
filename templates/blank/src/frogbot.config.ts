import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { lexicalEditor } from '@frogbotai/richtext-lexical';
import type { FrogBotConfig } from 'frogbot';
import { buildConfig } from 'frogbot';
import { general } from 'frogbot/agents';
import { todoTools } from 'frogbot/tools';

import { assistant } from './agents/assistant';
import { Users } from './collections';

const config: FrogBotConfig = {
  secret: process.env.FROGBOT_SECRET || '',
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL || '' },
  }),
  editor: lexicalEditor(),
  collections: [Users],
  tools: [...todoTools],
  ai: {
    defaultModel: 'openai/gpt-5.4-mini',
    providers: { openai: true },
  },
  admin: {},
  agents: [general(), assistant],
};

export default buildConfig(config);

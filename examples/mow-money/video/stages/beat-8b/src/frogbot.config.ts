import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { aiPolicyPlugin } from '@frogbotai/plugin-ai-policy';
import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { dojo } from '@frogbotai/plugin-dojo';
import { lexicalEditor } from '@frogbotai/richtext-lexical';
import { sharpTransformer } from '@frogbotai/transformer-sharp';
import type { FrogBotConfig } from 'frogbot';
import { buildConfig } from 'frogbot';
import { general } from 'frogbot/agents';
import { todoTools } from 'frogbot/tools';

import { assistant } from './agents/assistant';
import { Files } from './collections/Files';
import { Jobs } from './collections/Jobs';
import { Users } from './collections/Users';

const config: FrogBotConfig = {
  secret: process.env.FROGBOT_SECRET || '',
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL || '' } }),
  editor: lexicalEditor(),
  collections: [Users, Files, Jobs],
  tools: [...todoTools],
  ai: {
    providers: {
      anthropic: true,
      openai: true,
      bedrock: { region: 'us-east-1' },
    },
    routers: {
      fast: { model: 'anthropic/claude-haiku-5-5' },
      smart: { model: 'anthropic/claude-sonnet-5-5' },
    },
    defaultModel: 'fast',
  },
  admin: {
    meta: { titleSuffix: '- Edge Lords Lawn Care', appIcon: '/edge-lords.png' },
    components: {
      graphics: {
        Logo: '/components/EdgeLordsLogo#EdgeLordsLogo',
        Icon: '/components/EdgeLordsIcon#EdgeLordsIcon',
      },
    },
  },
  agents: [general(), assistant],
  plugins: [aiPolicyPlugin(), apiKeysPlugin(), dojo()],
  upload: { transformers: [sharpTransformer()] },
};

export default buildConfig(config);

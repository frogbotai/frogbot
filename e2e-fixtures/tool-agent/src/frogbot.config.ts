import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { FrogbotConfig } from 'frogbot';
import { buildConfig } from 'frogbot';

import { toolDemo } from './agents/toolDemo';
import { Users } from './collections/users';

const model = process.env.E2E_ZEN_MODEL ?? 'zen/deepseek-v4-flash-free';

const config: FrogbotConfig = {
  secret: process.env.FROGBOT_SECRET ?? 'e2e-secret',
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL ?? 'file:./frogbot.db' },
  }),
  collections: [Users],
  typescript: { autoGenerate: false },
  ai: {
    providers: {
      zen: {
        type: 'openai-compatible',
        baseUrl: 'https://opencode.ai/zen/v1',
        apiKey: process.env.OPENCODE_API_KEY ?? 'public',
        models: [{ id: model.replace(/^zen\//, ''), mode: 'chat' }],
      },
    },
    routers: { e2e: { model } },
  },
  agents: [toolDemo],
};

export default buildConfig(config);

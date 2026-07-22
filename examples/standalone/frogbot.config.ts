import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';
import type { CollectionConfig, FrogbotConfig } from 'frogbot';

const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [{ name: 'name', type: 'text' }],
};

const config: FrogbotConfig = {
  secret: process.env.FROGBOT_SECRET ?? 'dev-secret-change-me',
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL ?? 'file:./frogbot.db' },
  }),
  collections: [Users],
  ai: {
    providers: {
      openai: { apiKey: process.env.OPENAI_API_KEY ?? '' },
    },
  },
  agents: [
    {
      slug: 'assistant',
      model: 'openai/gpt-4o-mini',
      instructions: 'You are a concise and friendly assistant.',
      access: () => true,
    },
  ],
};

export default buildConfig(config);

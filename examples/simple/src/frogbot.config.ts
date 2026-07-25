import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { buildConfig } from 'frogbot';
import type { CollectionConfig, FrogbotConfig, Tool } from 'frogbot';
import { z } from 'zod';

const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [{ name: 'name', type: 'text' }],
};

const getTimeSchema = z.object({
  timezone: z
    .string()
    .optional()
    .describe('An IANA timezone, e.g. "America/Los_Angeles". Defaults to UTC.'),
});

const getTime: Tool<typeof getTimeSchema> = {
  slug: 'get_time',
  description: 'Get the current date and time, optionally in a specific IANA timezone.',
  inputSchema: getTimeSchema,
  execute: ({ timezone }) => {
    const now = new Date();
    const zone = timezone ?? 'UTC';
    return {
      iso: now.toISOString(),
      formatted: now.toLocaleString('en-US', { timeZone: zone }),
      timezone: zone,
    };
  },
};

const config: FrogbotConfig = {
  secret: process.env.FROGBOT_SECRET ?? 'dev-secret-change-me',
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL ?? 'file:./frogbot.db' },
  }),
  collections: [Users],
  ai: {
    providers: {
      openai: true,
    },
  },
  agents: [
    {
      slug: 'assistant',
      model: 'openai/gpt-4o-mini',
      instructions:
        'You are FrogBot, a concise and friendly assistant. ' +
        'Use the get_time tool whenever the user asks about the current date or time.',
      tools: [getTime],
      access: () => true,
    },
  ],
};

export default buildConfig(config);

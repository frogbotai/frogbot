import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { FrogBotConfig } from 'frogbot';

export const authTypeConfig: FrogBotConfig = {
  secret: 'auth-type-fixture',
  db: sqliteAdapter({ client: { url: 'file::memory:' } }),
  collections: [
    {
      slug: 'users',
      auth: true,
      fields: [{ name: 'nickname', type: 'text' }],
    },
    {
      slug: 'admins',
      auth: true,
      fields: [{ name: 'level', type: 'number', required: true }],
    },
  ],
};

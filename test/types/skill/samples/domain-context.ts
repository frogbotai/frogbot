import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { FrogbotConfig } from 'frogbot';

export const domainConfig: FrogbotConfig = {
  secret: 'skill-domain-validation-secret',
  db: sqliteAdapter({ client: { url: 'file:skill-domains.db' } }),
  collections: [
    {
      slug: 'users',
      auth: true,
      fields: [],
    },
    {
      slug: 'projects',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'status', type: 'text', required: true },
      ],
    },
  ],
};

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { FrogbotConfig } from 'frogbot';

export const jobsTypeConfig: FrogbotConfig = {
  secret: 'jobs-type-fixture',
  db: sqliteAdapter({ client: { url: 'file::memory:' } }),
  collections: [{ slug: 'users', auth: true, fields: [] }],
  jobs: {
    tasks: [
      {
        slug: 'send-notification',
        inputSchema: [{ name: 'recipient', type: 'text', required: true }],
        outputSchema: [{ name: 'delivered', type: 'checkbox', required: true }],
        handler: async () => ({ output: { delivered: true } }),
      },
      {
        slug: 'count-items',
        inputSchema: [{ name: 'count', type: 'number', required: true }],
        outputSchema: [{ name: 'total', type: 'number', required: true }],
        handler: async () => ({ output: { total: 1 } }),
      },
    ],
    workflows: [
      {
        slug: 'onboard-account',
        inputSchema: [{ name: 'accountID', type: 'number', required: true }],
        handler: async () => {},
      },
    ],
  },
};

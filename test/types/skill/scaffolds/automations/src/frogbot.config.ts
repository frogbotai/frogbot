// src/frogbot.config.ts
import { sqliteAdapter } from '@frogbotai/db-sqlite';
import { createResend } from '@frogbotai/piece-resend';
import { rolesPlugin } from '@frogbotai/plugin-roles';
import { buildConfig } from 'frogbot';

import { Deals } from './collections/Deals';
import { Enrollments } from './collections/Enrollments';
import { Tickets } from './collections/Tickets';
import { autoSolve } from './jobs/autoSolve';
import { followUp } from './jobs/followUp';
import { sendWebhook } from './jobs/sendWebhook';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: sqliteAdapter({ client: { url: process.env.DATABASE_URL! } }),
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
  email: createResend({
    auth: { apiKey: process.env.RESEND_API_KEY! },
    from: { address: 'support@example.com', name: 'Support' },
  }),
  collections: [{ slug: 'users', auth: true, fields: [] }, Tickets, Enrollments, Deals],
  plugins: [rolesPlugin({ roles: ['admin', 'agent'] })],
  jobs: {
    workflows: [autoSolve, followUp],
    tasks: [sendWebhook],
    autoRun: [{ cron: '* * * * *', allQueues: true }],
    deleteJobOnComplete: false,
    jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
      ...defaultJobsCollection,
      access: {
        ...defaultJobsCollection.access,
        read: ({ req }) => {
          const roles = req.user && 'roles' in req.user ? req.user.roles : [];

          return Array.isArray(roles) && roles.includes('admin');
        },
      },
      admin: { ...defaultJobsCollection.admin, hidden: false },
    }),
  },
});

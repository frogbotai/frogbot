import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { FrogBotInstance } from 'frogbot';
import { buildConfig } from 'frogbot';
import type { JobsConfig } from 'frogbot/jobs';

import { approvalWorkflow } from '../scaffolds/jobs/src/jobs/approvalWorkflow.js';
import { domainConfig } from './domain-context.js';

export const config = buildConfig({
  secret: 'test-secret',
  db: sqliteAdapter({ client: { url: 'file:skill.db' } }),
  collections: [],
  jobs: {
    tasks: [
      {
        slug: 'send-report',
        inputSchema: [{ name: 'reportId', type: 'text', required: true }],
        outputSchema: [{ name: 'reportId', type: 'text', required: true }],
        handler({ input }) {
          return { output: { reportId: input.reportId } };
        },
      },
    ],
  },
});

export async function queueReport(frogbot: FrogBotInstance) {
  await frogbot.jobs.queue({
    task: 'send-report',
    input: { reportId: 'report-123' },
    queue: 'default',
    overrideAccess: true,
  });
}

export const workflowConfig = buildConfig({
  ...domainConfig,
  serverURL: 'https://app.example.com',
  jobs: { workflows: [approvalWorkflow] },
});

export const workerJobs = {
  autoRun: [],
  shouldAutoRun: () => false,
} satisfies JobsConfig;

export const workerConfig = buildConfig({
  ...domainConfig,
  serverURL: 'https://app.example.com',
  jobs: {
    ...workerJobs,
    workflows: [approvalWorkflow],
  },
});

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { FrogBotInstance } from 'frogbot';
import { buildConfig } from 'frogbot';
import type { JobsConfig, WorkflowConfig, WorkflowHandler } from 'frogbot/jobs';

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
        async handler({ input }) {
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
  });
}

export async function waitForApproval(waitFor: Parameters<WorkflowHandler>[0]['waitFor']) {
  const result = await waitFor<{ approved: boolean }>('approval', {
    expiresIn: 86_400_000,
    async onWait({ resumeUrl }) {
      await fetch('https://example.com/approvals', {
        method: 'POST',
        body: JSON.stringify({ resumeUrl }),
      });
    },
  });

  if (result.expired) return { output: { approved: false } };

  return { output: { approved: result.data.approved } };
}

export const approvalWorkflow: WorkflowConfig = {
  slug: 'approval',
  async handler({ waitFor }) {
    const { output } = await waitForApproval(waitFor);

    console.log(output.approved);
  },
};

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

// src/jobs/approvalWorkflow.ts
import type { WorkflowConfig } from 'frogbot/jobs';

export const approvalWorkflow: WorkflowConfig<{ requestId: string }> = {
  slug: 'approval',
  inputSchema: [{ name: 'requestId', type: 'text', required: true }],
  async handler({ job, inlineTask, waitFor }) {
    const { requestId } = job.input;

    await inlineTask('prepare-request', {
      task: () => ({ output: { requestId, preparedAt: new Date().toISOString() } }),
    });

    const result = await waitFor<{ approved: boolean }>('approval', {
      expiresIn: 24 * 60 * 60 * 1000,
      onWait({ resumeUrl }) {
        // Send this link to the approver instead, by email or chat.
        console.log(`[approval] ${requestId} waits for approval: ${resumeUrl}`);
      },
    });

    if (result.expired) {
      await inlineTask('record-expired', {
        task: () => ({ output: { requestId, approved: false } }),
      });

      return;
    }

    await inlineTask('record-approval', {
      task: () => ({ output: { requestId, approved: result.data.approved } }),
    });
  },
};

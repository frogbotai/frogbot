import type { WorkflowHandler } from '../../../packages/frogbot/src/jobs/types.js';

export const named: WorkflowHandler = async ({ waitFor }) => {
  await waitFor('named', { until: '2026-10-01' });
};

const handler: WorkflowHandler = async ({ waitFor }) => {
  await waitFor('default', { until: '2026-10-01' });
};

export default handler;

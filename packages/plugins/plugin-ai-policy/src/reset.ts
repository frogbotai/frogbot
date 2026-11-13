import type { TaskConfig } from 'frogbot';

import { currentPeriod, SPEND_COUNTERS_SLUG } from './counters.js';

export const RESET_TASK_SLUG = 'plugin-ai-policy-reset-spend';

/** Starts every counter at 0 for the new month; user and key rows are never written. */
export function createResetTask(): TaskConfig {
  return {
    slug: RESET_TASK_SLUG,
    interfaceName: 'TaskPluginAiPolicyResetSpend',
    schedule: [{ cron: '0 0 1 * *', queue: RESET_TASK_SLUG }],
    handler: async ({ req }) => {
      await req.frogbot.update({
        collection: SPEND_COUNTERS_SLUG,
        where: { period: { not_equals: currentPeriod() } },
        data: { amount: 0, period: currentPeriod() },
        overrideAccess: true,
        req,
      });

      return { output: {} };
    },
  };
}

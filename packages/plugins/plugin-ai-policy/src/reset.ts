import type { TaskConfig } from 'frogbot';

import { currentPeriod, SPEND_COUNTERS_SLUG } from './counters.js';

export const RESET_TASK_SLUG = 'plugin-ai-policy-reset-spend';

/**
 * Starts counters from earlier months at 0; user and key rows are never written. Each write checks
 * the period itself, so a counter an AI call already moved into this month keeps its spend.
 * It runs hourly on the 1st and 2nd so the UTC month change is covered whatever the server's time zone.
 */
export function createResetTask(): TaskConfig {
  return {
    slug: RESET_TASK_SLUG,
    interfaceName: 'TaskPluginAiPolicyResetSpend',
    schedule: [{ cron: '0 * 1,2 * *', queue: RESET_TASK_SLUG }],
    handler: async ({ req }) => {
      const period = currentPeriod();
      const { db } = req.frogbot;
      const stale = { period: { less_than: period } };

      const { docs } = await req.frogbot.find({
        collection: SPEND_COUNTERS_SLUG,
        where: stale,
        depth: 0,
        pagination: false,
        overrideAccess: true,
      });

      for (const { id } of docs) {
        await db.updateOne({
          collection: SPEND_COUNTERS_SLUG,
          where: { and: [{ id: { equals: id } }, stale] },
          data: { amount: 0, period },
          options: { atomic: true },
          returning: false,
        });
      }

      return { output: {} };
    },
  };
}

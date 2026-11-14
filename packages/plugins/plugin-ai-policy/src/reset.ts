import type { TaskConfig } from 'frogbot';

import { type Period, SPEND_COUNTERS_SLUG } from './counters.js';

export const RESET_TASK_SLUG = 'plugin-ai-policy-reset-spend';

/**
 * Starts counters from earlier months at 0; user and key rows are never written. Each write checks
 * the period itself, so a counter an AI call already moved into this month keeps its spend.
 * It runs hourly around the turn of the month, so the change of month on the plugin's calendar is
 * covered whatever the server's time zone.
 */
export function createResetTask(period: Period): TaskConfig {
  return {
    slug: RESET_TASK_SLUG,
    interfaceName: 'TaskPluginAiPolicyResetSpend',
    schedule: [{ cron: '0 * 1,2,28-31 * *', queue: RESET_TASK_SLUG }],
    handler: async ({ req }) => {
      const current = period();
      const { db } = req.frogbot;
      const stale = { period: { less_than: current } };

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
          data: { amount: 0, period: current },
          options: { atomic: true },
          returning: false,
        });
      }

      return { output: {} };
    },
  };
}

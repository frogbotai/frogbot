import type { TaskConfig } from 'frogbot';
import { toPayloadRequest } from 'frogbot/internal';

export const RESET_TASK_SLUG = 'plugin-ai-policy-reset-spend';

export function createResetTask({
  authCollection,
  keysCollection,
}: {
  authCollection: string;
  keysCollection?: string;
}): TaskConfig {
  return {
    slug: RESET_TASK_SLUG,
    interfaceName: 'TaskPluginAiPolicyResetSpend',
    schedule: [{ cron: '0 0 1 * *', queue: RESET_TASK_SLUG }],
    handler: async ({ req }) => {
      for (const collection of keysCollection
        ? [authCollection, keysCollection]
        : [authCollection]) {
        await req.frogbot.db.updateMany({
          collection,
          where: { id: { exists: true } },
          data: { spendThisPeriodUSD: 0 },
          req: toPayloadRequest(req),
        });
      }

      return { output: {} };
    },
  };
}

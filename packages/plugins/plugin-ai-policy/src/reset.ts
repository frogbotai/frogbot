import type { TaskConfig } from 'frogbot';

export const RESET_TASK_SLUG = 'plugin-ai-policy-reset-spend';

export function createResetTask({ authCollection }: { authCollection: string }): TaskConfig {
  return {
    slug: RESET_TASK_SLUG,
    interfaceName: 'TaskPluginAiPolicyResetSpend',
    schedule: [{ cron: '0 0 1 * *', queue: RESET_TASK_SLUG }],
    handler: async ({ req }) => {
      await req.payload.update({
        collection: authCollection,
        where: { id: { exists: true } },
        data: { spendThisPeriodUSD: 0 },
        overrideAccess: true,
        req,
      });

      return { output: {} };
    },
  };
}

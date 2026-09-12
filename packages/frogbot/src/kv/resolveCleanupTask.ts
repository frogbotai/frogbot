import type { JobsConfig, KVAdapterResult } from 'payload';

import { DatabaseKVAdapter, kvDatabase } from './adapters/DatabaseKVAdapter.js';

export const KV_CLEANUP_TASK_SLUG = 'frogbot-cleanup-kv';

export function resolveKVCleanupTask({
  kv,
  jobs,
}: {
  kv: KVAdapterResult;
  jobs?: JobsConfig;
}): JobsConfig | undefined {
  if (!(kvDatabase in kv) || kv[kvDatabase] !== true) return jobs;
  if (jobs?.tasks?.some((task) => task.slug === KV_CLEANUP_TASK_SLUG)) {
    throw new Error(
      `Job task slug '${KV_CLEANUP_TASK_SLUG}' is reserved for KV expiration cleanup`,
    );
  }
  return {
    ...jobs,
    tasks: [
      ...(jobs?.tasks ?? []),
      {
        slug: KV_CLEANUP_TASK_SLUG,
        schedule: [{ cron: '0 * * * *', queue: 'default' }],
        handler: async ({ req }) => {
          if (!(req.payload.kv instanceof DatabaseKVAdapter)) {
            throw new Error('KV cleanup requires the database KV adapter');
          }
          await req.payload.kv.cleanup();
          return { output: {} };
        },
      },
    ],
  };
}

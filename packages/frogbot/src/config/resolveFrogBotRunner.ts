import type { JobsConfig } from 'payload';

import type { AgentConfig } from '../agents/types.js';
import { channelQueue } from '../channels/queueChannelTask.js';
import { AI_FIELD_TASK_SLUG } from '../fields/baseFields/ai/hooks.js';
import { FROGBOT_QUEUE, resolveFrogBotAutoRun } from '../jobs/autoRun.js';
import { WAITPOINT_SWEEP_TASK_SLUG } from '../jobs/config.js';
import { KV_CLEANUP_TASK_SLUG } from '../kv/resolveCleanupTask.js';
import { triggerQueue } from '../triggers/dispatch.js';
import type { IngressRegistry } from '../triggers/types.js';

/**
 * Adds FrogBot's runner for the queues FrogBot queues jobs on at runtime (AI fields, triggers and
 * channels) and the FrogBot queues tasks are scheduled on, including plugins' tasks.
 */
export function resolveFrogBotRunner<T extends JobsConfig>({
  agents,
  jobs,
  triggers,
}: {
  agents?: readonly AgentConfig[];
  jobs: T;
  triggers: IngressRegistry;
}): T {
  return resolveFrogBotAutoRun({
    housekeeping: [WAITPOINT_SWEEP_TASK_SLUG, KV_CLEANUP_TASK_SLUG],
    jobs,
    queues: [
      ...(jobs.tasks?.some(({ slug }) => slug === AI_FIELD_TASK_SLUG) ? [FROGBOT_QUEUE] : []),
      ...Object.values(triggers).flatMap(({ subscribers }) =>
        subscribers.map((subscriber) =>
          triggerQueue(subscriber.agentSlug, subscriber.trigger.trigger.slug),
        ),
      ),
      ...(agents ?? []).flatMap((agent) =>
        (agent.channels ?? []).map((instance) => channelQueue(agent.slug, instance.slug)),
      ),
    ],
  });
}

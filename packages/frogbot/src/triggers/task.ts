import type { JobsConfig, TaskConfig } from 'payload';

import { AGENT_SCHEDULE_TASK_SLUG } from '../agents/resolveScheduleTasks.js';
import { getFrogBotInstance } from '../instanceRegistry.js';

export const AGENT_TRIGGER_TASK_SLUG = 'frogbot-run-agent-trigger';

type AgentTriggerTask = {
  input: { agentSlug: string; instanceSlug: string; triggerSlug: string; event: unknown };
  output: Record<string, never>;
};
type AutorunCronConfig = Extract<NonNullable<JobsConfig['autoRun']>, unknown[]>[number];

export function resolveTriggerTasks(jobs?: JobsConfig): JobsConfig {
  const task: TaskConfig<AgentTriggerTask> = {
    slug: AGENT_TRIGGER_TASK_SLUG,
    handler: async ({ input, req }) => {
      const frogbot = getFrogBotInstance(req.payload);
      if (!frogbot) return { output: {} };
      const agent = frogbot?.agents[input.agentSlug];
      const configured = agent?.config.triggers?.find(
        (trigger) =>
          'trigger' in trigger &&
          trigger.trigger.slug === input.triggerSlug &&
          frogbot.config._internal.triggers[input.instanceSlug]?.subscribers.some(
            (subscriber) =>
              subscriber.agentSlug === input.agentSlug && subscriber.trigger === trigger,
          ),
      );
      if (!agent || !configured || !('trigger' in configured)) return { output: {} };
      const triggerReq = await frogbot.createRequest({
        context: {
          ...req.context,
          trigger: {
            piece: input.instanceSlug,
            trigger: input.triggerSlug,
            agent: input.agentSlug,
          },
        },
      });
      await configured.handler({
        event: (input.event as { data: unknown }).data as never,
        agent,
        req: triggerReq,
      });
      return { output: {} };
    },
  };
  const tasks = [...(jobs?.tasks ?? []), task];
  if (tasks.some(({ slug }) => slug === AGENT_SCHEDULE_TASK_SLUG)) return { ...jobs, tasks };
  const autoRun = jobs?.autoRun;
  const frogAutoRun: AutorunCronConfig = { allQueues: true, cron: '* * * * *' };
  return {
    ...jobs,
    tasks,
    autoRun:
      typeof autoRun === 'function'
        ? async (payload) => [...(await autoRun(payload)), frogAutoRun]
        : [...(autoRun ?? []), frogAutoRun],
  };
}

import { Cron } from 'croner';
import type { JobsConfig, TaskConfig } from 'payload';

import { getFrogBotInstance } from '../instanceRegistry.js';
import { withFrogBotAutoRun } from '../jobs/autoRun.js';
import { isRecord } from '../utilities/isRecord.js';
import type { AgentConfig, AgentScheduleTrigger } from './types.js';

export const AGENT_SCHEDULE_TASK_SLUG = 'frogbot-run-agent-schedule';

type ScheduledAgentJob = { agentSlug: string; triggerSlug: string };

type ScheduledAgentTask = { input: ScheduledAgentJob; output: Record<string, never> };

function scheduleCron(trigger: AgentScheduleTrigger): string {
  return 'every' in trigger.schedule ? everyToCron(trigger.schedule.every!) : trigger.schedule.cron;
}

export function everyToCron(every: string): string {
  const match = /^(\d+)([smhd])$/.exec(every);
  if (!match || Number(match[1]) === 0) {
    throw new Error(
      `[frogbot] Invalid schedule duration '${every}'. Use a positive duration such as '30m' or a raw cron expression.`,
    );
  }

  const value = Number(match[1]);
  const unit = match[2];
  const limits = { s: 60, m: 60, h: 24, d: 1 } as const;
  if (limits[unit as keyof typeof limits] % value !== 0) {
    throw new Error(
      `[frogbot] Schedule duration '${every}' does not divide evenly into its cron field. Use a raw cron expression instead.`,
    );
  }

  if (unit === 's') return value === 60 ? '* * * * *' : `*/${value} * * * * *`;
  if (unit === 'm') return value === 60 ? '0 * * * *' : `*/${value} * * * *`;
  if (unit === 'h') return value === 24 ? '0 0 * * *' : `0 */${value} * * *`;

  return '0 0 * * *';
}

/** Checks a cron expression, naming `label` (such as `Trigger 'x' in agent 'y'`) on failure. */
export function assertCron(cron: string, label: string): string {
  try {
    new Cron(cron);
  } catch {
    throw new Error(`[frogbot] ${label} has an invalid cron expression: '${cron}'.`);
  }

  return cron;
}

/** Validates an `AgentSchedule` and returns its cron, naming `label` on failure. */
export function resolveScheduleCron(schedule: unknown, label: string): string {
  if (!isRecord(schedule)) throw new Error(`[frogbot] ${label} requires a schedule.`);

  const hasEvery = typeof schedule.every === 'string';
  const hasCron = typeof schedule.cron === 'string';

  if (hasEvery === hasCron) {
    throw new Error(`[frogbot] ${label} schedule requires exactly one of every or cron.`);
  }

  if (schedule.timezone !== undefined) {
    throw new Error(`[frogbot] ${label} timezone is not yet supported. Cron schedules use UTC.`);
  }

  if (hasCron) return assertCron(schedule.cron as string, label);

  try {
    return assertCron(everyToCron(schedule.every as string), label);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`[frogbot] ${label}: ${message.replace(/^\[frogbot\] /, '')}`);
  }
}

export function resolveScheduleTasks({
  agents,
  jobs,
}: {
  agents?: AgentConfig[];
  jobs?: JobsConfig;
}): JobsConfig | undefined {
  const scheduled = (agents ?? []).flatMap((agent) =>
    (agent.triggers ?? [])
      .filter(
        (trigger): trigger is AgentScheduleTrigger =>
          'type' in trigger && trigger.type === 'schedule',
      )
      .map((trigger) => ({ agent, trigger })),
  );

  if (!scheduled.length) return jobs;

  const task: TaskConfig<ScheduledAgentTask> = {
    slug: AGENT_SCHEDULE_TASK_SLUG,
    interfaceName: 'TaskFrogBotRunAgentSchedule',
    schedule: scheduled.map(({ agent, trigger }) => ({
      cron: scheduleCron(trigger),
      queue: `frogbot-schedule:${agent.slug}:${trigger.slug}`,
      hooks: {
        beforeSchedule: async ({ defaultBeforeSchedule, ...args }) => {
          const result = await defaultBeforeSchedule({ defaultBeforeSchedule, ...args });

          return {
            ...result,
            input: { agentSlug: agent.slug, triggerSlug: trigger.slug },
          };
        },
      },
    })),
    handler: async ({ input, job, req }) => {
      const frogbot = getFrogBotInstance(req.payload);
      const agent = frogbot?.agents[input.agentSlug];
      const trigger = agent?.config.triggers?.find(
        (candidate): candidate is AgentScheduleTrigger =>
          'type' in candidate &&
          candidate.type === 'schedule' &&
          candidate.slug === input.triggerSlug,
      );

      if (!frogbot || !agent || !trigger) return { output: {} };

      const scheduleReq = await frogbot.createRequest({
        context: {
          ...req.context,
          source: 'schedule',
          agentSlug: input.agentSlug,
          triggerSlug: input.triggerSlug,
          jobId: job.id,
        },
      });

      if ('prompt' in trigger && trigger.prompt !== undefined) {
        await agent.generate({ prompt: trigger.prompt, req: scheduleReq, overrideAccess: true });
      } else if (trigger.handler) {
        await trigger.handler({
          frogbot,
          agent,
          req: scheduleReq,
          job: {
            id: job.id,
            scheduledFor: new Date(job.waitUntil ?? job.createdAt),
          },
        });
      }

      return { output: {} };
    },
  };

  return {
    ...jobs,
    tasks: [...(jobs?.tasks ?? []), task],
    autoRun: withFrogBotAutoRun(jobs?.autoRun),
  };
}

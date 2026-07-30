import type { JobsConfig, TaskConfig } from "payload";

import { getFrogbotInstance } from "../instanceRegistry.js";
import type { AgentConfig, AgentScheduleTrigger } from "../types/agent.js";

export const AGENT_SCHEDULE_TASK_SLUG = "frogbot-run-agent-schedule";

type ScheduledAgentJob = { agentSlug: string; triggerSlug: string };
type ScheduledAgentTask = { input: ScheduledAgentJob; output: Record<string, never> };
type AutorunCronConfig = Extract<
  NonNullable<JobsConfig["autoRun"]>,
  unknown[]
>[number];

function scheduleCron(trigger: AgentScheduleTrigger): string {
  return "every" in trigger.schedule
    ? everyToCron(trigger.schedule.every!)
    : trigger.schedule.cron;
}

export function everyToCron(every: string): string {
  const match = /^(\d+)([smhd])$/.exec(every);
  if (!match || Number(match[1]) === 0) {
    throw new Error(`[frogbot] Invalid schedule duration '${every}'. Use a positive duration such as '30m' or a raw cron expression.`);
  }
  const value = Number(match[1]);
  const unit = match[2];
  const limits = { s: 60, m: 60, h: 24, d: 1 } as const;
  if (limits[unit as keyof typeof limits] % value !== 0) {
    throw new Error(`[frogbot] Schedule duration '${every}' does not divide evenly into its cron field. Use a raw cron expression instead.`);
  }
  if (unit === "s") return value === 60 ? "* * * * *" : `*/${value} * * * * *`;
  if (unit === "m") return value === 60 ? "0 * * * *" : `*/${value} * * * *`;
  if (unit === "h") return value === 24 ? "0 0 * * *" : `0 */${value} * * *`;
  return "0 0 * * *";
}

export function resolveScheduleTasks({
  agents,
  jobs,
}: {
  agents?: AgentConfig[];
  jobs?: JobsConfig;
}): JobsConfig | undefined {
  const scheduled = (agents ?? []).flatMap((agent) =>
    (agent.triggers ?? []).map((trigger) => ({ agent, trigger })),
  );
  if (!scheduled.length) return jobs;

  const task: TaskConfig<ScheduledAgentTask> = {
    slug: AGENT_SCHEDULE_TASK_SLUG,
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
      const frogbot = getFrogbotInstance(req.payload);
      const agent = frogbot?.agents[input.agentSlug];
      const trigger = agent?.config.triggers?.find(
        (candidate) => candidate.slug === input.triggerSlug,
      );
      if (!frogbot || !agent || !trigger) return { output: {} };

      const scheduleReq = await frogbot.createRequest({
        context: {
          source: "schedule",
          agentSlug: input.agentSlug,
          triggerSlug: input.triggerSlug,
          jobId: job.id,
        },
      });
      if ("prompt" in trigger && trigger.prompt !== undefined) {
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
  const autoRun = jobs?.autoRun;
  const frogAutoRun: AutorunCronConfig = { allQueues: true, cron: "* * * * *" };
  return {
    ...jobs,
    tasks: [...(jobs?.tasks ?? []), task],
    autoRun:
      typeof autoRun === "function"
        ? async (payload) => [...(await autoRun(payload)), frogAutoRun]
        : [...(autoRun ?? []), frogAutoRun],
  };
}

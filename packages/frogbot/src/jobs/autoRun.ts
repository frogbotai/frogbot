import { isDeepStrictEqual } from 'node:util';

import type { JobsConfig } from 'payload';

type AutorunCronConfig = Extract<NonNullable<JobsConfig['autoRun']>, unknown[]>[number];

/** The queue FrogBot's own tasks, and plugins' tasks, run on. */
export const FROGBOT_QUEUE = 'frogbot';

/** Whether FrogBot's runner covers `queue`: `frogbot`, or one of FrogBot's `frogbot-*` queues. */
export function isFrogBotQueue(queue: string): boolean {
  return queue === FROGBOT_QUEUE || queue.startsWith(`${FROGBOT_QUEUE}-`);
}

/** The per-minute runner FrogBot adds for one of its queues. It logs job errors, not "Running N jobs." */
export function frogbotAutoRun(queue: string): AutorunCronConfig {
  return { cron: '* * * * *', queue, silent: { info: true } };
}

/** Appends a {@link frogbotAutoRun} entry for each queue to `autoRun`, unless an equal entry is already there. */
export function withFrogBotAutoRun(
  autoRun: JobsConfig['autoRun'],
  queues: readonly string[],
): JobsConfig['autoRun'] {
  const append = (entries: AutorunCronConfig[]) => [
    ...entries,
    ...queues
      .map(frogbotAutoRun)
      .filter((runner) => !entries.some((entry) => isDeepStrictEqual(entry, runner))),
  ];

  if (typeof autoRun === 'function') return async (payload) => append(await autoRun(payload));

  return append(autoRun ?? []);
}

/**
 * Adds FrogBot's runner when FrogBot or a plugin has work on a FrogBot queue: `queues` FrogBot
 * queues jobs on at runtime, or a task or workflow scheduled on one. The runner covers those
 * queues and `frogbot`, never the app's own queues. Tasks in `housekeeping` don't turn it on; they
 * stay on the app's queues without it and move to `frogbot` with it.
 */
export function resolveFrogBotAutoRun<T extends JobsConfig>({
  housekeeping,
  jobs,
  queues,
}: {
  housekeeping: readonly string[];
  jobs: T;
  queues: readonly string[];
}): T {
  const scheduled = [...(jobs.tasks ?? []), ...(jobs.workflows ?? [])]
    .filter(({ slug }) => !housekeeping.includes(slug))
    .flatMap(({ schedule }) => (schedule ?? []).map(({ queue }) => queue))
    .filter(isFrogBotQueue);

  if (!queues.length && !scheduled.length) return jobs;

  return {
    ...jobs,
    tasks: jobs.tasks?.map((task) =>
      housekeeping.includes(task.slug) && task.schedule
        ? { ...task, schedule: task.schedule.map((entry) => ({ ...entry, queue: FROGBOT_QUEUE })) }
        : task,
    ),
    autoRun: withFrogBotAutoRun(jobs.autoRun, [
      ...new Set([FROGBOT_QUEUE, ...queues, ...scheduled]),
    ]),
  };
}

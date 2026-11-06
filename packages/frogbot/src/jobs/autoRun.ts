import { isDeepStrictEqual } from 'node:util';

import type { JobsConfig } from 'payload';

type AutorunCronConfig = Extract<NonNullable<JobsConfig['autoRun']>, unknown[]>[number];

/** The per-minute runner FrogBot adds for its own tasks. It logs job errors, not "Running N jobs." */
export const FROGBOT_AUTORUN: AutorunCronConfig = {
  allQueues: true,
  cron: '* * * * *',
  silent: { info: true },
};

/** Appends {@link FROGBOT_AUTORUN} to `autoRun` unless an equal entry is already there. */
export function withFrogBotAutoRun(autoRun: JobsConfig['autoRun']): JobsConfig['autoRun'] {
  const append = (entries: AutorunCronConfig[]) =>
    entries.some((entry) => isDeepStrictEqual(entry, FROGBOT_AUTORUN))
      ? entries
      : [...entries, FROGBOT_AUTORUN];

  if (typeof autoRun === 'function') return async (payload) => append(await autoRun(payload));

  return append(autoRun ?? []);
}

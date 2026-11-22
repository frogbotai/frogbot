import type { DeployTarget } from 'frogbot';

import { shareUsage } from './cli/flags.js';

/** `frogbot deploy`'s default target: the app's code, keys and first data, built and hosted by Dojo. */
export const dojoTarget: DeployTarget = {
  describe: "Host the app on Dojo, FrogBot's hosting (the default)",
  usage: shareUsage,
  preflight: async (context) => (await import('./cli/run.js')).sharePreflight(context),
  run: async (context) => (await import('./cli/run.js')).shareToDojo(context),
};

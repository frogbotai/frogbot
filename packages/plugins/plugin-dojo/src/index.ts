import { type CLICommand, definePlugin } from 'frogbot';

import { withDojoAI } from './ai.js';
import { withDojoBadge, withDojoBadgeImport } from './badge.js';
import type { DojoCommandName } from './cli/commands.js';
import { readDojoEnv } from './env.js';
import { withDojoJobs } from './jobs.js';
import { withDojoStorage } from './storage.js';

function dojoCommand(name: DojoCommandName): CLICommand {
  return async ({ args }) =>
    (await import('./cli/commands.js')).runDojoCommand(name, args, 'frogbot');
}

/**
 * Runs a FrogBot app on Dojo: R2 file storage, AI through Dojo's gateway, scheduled jobs woken by
 * Dojo, and a "Made with FrogBot" badge. Adds the `share`, `pull`, `logs` and `logout` commands. Does
 * nothing else unless `DOJO=1`, apart from listing the badge for the import map, and keeps any storage
 * or provider key the app set. Runs after every other plugin, as Dojo's platform plugin does, so it
 * sees the upload collections and AI providers they add.
 */
export const dojo = definePlugin({
  slug: 'plugin-dojo',
  order: Number.MAX_SAFE_INTEGER,
  plugin: ({ config }) => {
    const env = readDojoEnv();
    const listed = withDojoBadgeImport({
      ...config,
      cli: {
        ...config.cli,
        commands: {
          ...config.cli?.commands,
          share: dojoCommand('share'),
          pull: dojoCommand('pull'),
          logs: dojoCommand('logs'),
          logout: dojoCommand('logout'),
        },
      },
    });

    if (!env) return listed;

    return withDojoBadge(withDojoJobs(withDojoAI(withDojoStorage(listed, env), env), env));
  },
});

/** What `frogbot/platform-plugin` resolves to when `FROGBOT_PLATFORM_PLUGIN=@frogbotai/plugin-dojo`. */
export default dojo();

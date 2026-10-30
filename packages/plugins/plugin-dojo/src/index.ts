import { type CLICommand, definePlugin } from 'frogbot';

import { withDojoAI } from './ai.js';
import { withDojoBadge, withDojoImports } from './badge.js';
import type { DojoCommandName } from './cli/commands.js';
import { readDojoEnv } from './env.js';
import { withDojoJobs } from './jobs.js';
import { withDojoSignIn } from './signIn.js';
import { withDojoStorage } from './storage.js';

function dojoCommand(name: DojoCommandName): CLICommand {
  return async ({ args }) =>
    (await import('./cli/commands.js')).runDojoCommand(name, args, 'frogbot');
}

export type DojoPluginOptions = {
  /** Adds "Continue with Dojo" to the user collection's sign-in methods on Dojo. Default `true`. */
  signIn?: boolean;
};

/**
 * Runs a FrogBot app on Dojo: R2 file storage, AI through Dojo's gateway, scheduled jobs woken by
 * Dojo, "Continue with Dojo" sign-in and a "Made with FrogBot" badge. Adds the `share`, `pull`, `logs`
 * and `logout` commands. Does nothing else unless `DOJO=1`, apart from listing the badge and sign-in
 * buttons for the import map, and keeps any storage or provider key the app set. Runs after every
 * other plugin, as Dojo's platform plugin does, so it sees the collections and AI providers they add.
 */
export const dojo = definePlugin<DojoPluginOptions | undefined>({
  slug: 'plugin-dojo',
  order: Number.MAX_SAFE_INTEGER,
  plugin: ({ config, options }) => {
    const env = readDojoEnv();
    const listed = withDojoImports({
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

    const signedIn = options?.signIn === false ? listed : withDojoSignIn(listed, env);

    return withDojoBadge(withDojoJobs(withDojoAI(withDojoStorage(signedIn, env), env), env));
  },
});

/** What `frogbot/platform-plugin` resolves to when `FROGBOT_PLATFORM_PLUGIN=@frogbotai/plugin-dojo`. */
export default dojo();

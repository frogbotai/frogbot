import { type CLICommand, definePlugin } from 'frogbot';

import { withDojoAI } from './ai.js';
import { withDojoBadge, withDojoImports } from './badge.js';
import { dojoTarget } from './deploy.js';
import { readDojoEnv } from './env.js';
import { withDojoFirstUser } from './firstUser.js';
import { withDojoJobs } from './jobs.js';
import { withDojoSignIn } from './signIn.js';
import { withDojoStorage } from './storage.js';

const dojoCommand: CLICommand = async ({ args }) =>
  (await import('./cli/commands.js')).runDojoCommand(args, 'frogbot dojo');

const shareCommand: CLICommand = async ({ args }) =>
  (await import('./cli/commands.js')).runDojoCommand(['apps', 'share', ...args], 'frogbot dojo');

export type DojoPluginOptions = {
  /** Adds "Continue with Dojo" to the user collection's sign-in methods on Dojo. Default `true`. */
  signIn?: boolean;
};

/**
 * Runs a FrogBot app on Dojo: R2 file storage, AI through Dojo's gateway, scheduled jobs woken by
 * Dojo, "Continue with Dojo" sign-in with the sharer as an empty app's first user, and a "Made with
 * FrogBot" badge. Adds the `dojo` deploy target, which `frogbot deploy` runs by default, the
 * `frogbot dojo` commands, and `frogbot share` for `frogbot deploy dojo`. Does nothing else unless
 * `DOJO=1`, apart from listing the badge and sign-in buttons for the import map, and keeps any
 * storage or provider key the app set. Runs after every other plugin, as Dojo's platform plugin
 * does, so it sees the collections and AI providers they add.
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
          dojo: dojoCommand,
          share: shareCommand,
        },
        deployTargets: { ...config.cli?.deployTargets, dojo: dojoTarget },
      },
    });

    if (!env) return listed;

    const signedIn = options?.signIn === false ? listed : withDojoSignIn(listed, env);
    const withDojo = signedIn.collections.find((entry, i) => entry !== listed.collections[i]);
    const seeded =
      withDojo && env.firstUserEmail
        ? withDojoFirstUser(signedIn, withDojo, env.firstUserEmail)
        : signedIn;

    return withDojoBadge(withDojoJobs(withDojoAI(withDojoStorage(seeded, env), env), env));
  },
});

/** What `frogbot/platform-plugin` resolves to when `FROGBOT_PLATFORM_PLUGIN=@frogbotai/plugin-dojo`. */
export default dojo();

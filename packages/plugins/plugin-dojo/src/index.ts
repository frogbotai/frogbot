import type { Plugin } from 'frogbot';

import { withDojoAI } from './ai.js';
import { withDojoBadge, withDojoBadgeImport } from './badge.js';
import { readDojoEnv } from './env.js';
import { withDojoJobs } from './jobs.js';
import { withDojoStorage } from './storage.js';

/**
 * Runs a FrogBot app on Dojo: R2 file storage, AI through Dojo's gateway, scheduled jobs woken by
 * Dojo, and a "Made with FrogBot" badge. Does nothing unless `DOJO=1`, apart from listing the badge for
 * the import map, and keeps any storage or provider key the app set.
 */
export function dojo(): Plugin {
  return (config) => {
    const env = readDojoEnv();
    const listed = withDojoBadgeImport(config);

    if (!env) return listed;

    return withDojoBadge(withDojoJobs(withDojoAI(withDojoStorage(listed, env), env), env));
  };
}

/** What `frogbot/platform-plugin` resolves to when `FROGBOT_PLATFORM_PLUGIN=@frogbotai/plugin-dojo`. */
export default dojo();

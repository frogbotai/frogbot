import type { Plugin } from 'frogbot';

import { withDojoAI } from './ai.js';
import { readDojoEnv } from './env.js';
import { withDojoJobs } from './jobs.js';
import { withDojoStorage } from './storage.js';

/**
 * Runs a FrogBot app on Dojo: R2 file storage, AI through Dojo's gateway, and scheduled jobs woken
 * by Dojo. Does nothing unless `DOJO=1`, and keeps any storage or provider key the app set.
 */
export function dojo(): Plugin {
  return (config) => {
    const env = readDojoEnv();

    if (!env) return config;

    return withDojoJobs(withDojoAI(withDojoStorage(config, env), env), env);
  };
}

/** What `frogbot/platform-plugin` resolves to when `FROGBOT_PLATFORM_PLUGIN=@frogbotai/plugin-dojo`. */
export default dojo();

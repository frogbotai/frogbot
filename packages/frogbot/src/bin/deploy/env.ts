import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

import nextEnvImport from '@next/env';

import { DeployError } from './error.js';

const { loadEnvConfig } = nextEnvImport;

const silentLog = { info: () => {}, error: () => {} };

const fromShell = ['FROGBOT_SECRET', 'DATABASE_URL'];

/**
 * The app's production variables: `envFile` alone, or the `.env` files `frogbot start` loads (first
 * file winning) plus `FROGBOT_SECRET` and `DATABASE_URL` from `shell` when no file sets them.
 */
export function readDeployEnv(
  root: string,
  { envFile, shell }: { envFile?: string; shell: Record<string, string | undefined> },
): Record<string, string> {
  if (envFile) {
    const path = resolve(root, envFile);
    let text: string;

    try {
      text = readFileSync(path, 'utf8');
    } catch {
      throw new DeployError(`--env-file ${envFile}: no such file (${path}).`, 2);
    }

    return defined(parseEnv(text));
  }

  const { loadedEnvFiles } = loadEnvConfig(root, false, silentLog, true);
  const env: Record<string, string> = {};

  for (const file of loadedEnvFiles) {
    for (const [name, value] of Object.entries(defined(file.env))) {
      if (!(name in env)) env[name] = value;
    }
  }

  for (const name of fromShell) {
    const value = shell[name];

    if (!env[name] && value) env[name] = value;
  }

  return env;
}

function defined(env: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])),
  );
}

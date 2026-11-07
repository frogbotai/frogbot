import { existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

import { findConfigFile } from '../../config/resolveConfigPath.js';
import { DeployError } from './error.js';
import type { DeployEnv, PreflightIssue } from './types.js';

const lockfiles = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'];

/** The app's folder: where `frogbot.config.*` lives, or its parent when that is `src/`. */
export function findAppRoot({ cwd, env }: { cwd: string; env: DeployEnv }): string {
  const fromEnv = env.FROGBOT_CONFIG_PATH;
  const envPath = fromEnv && (isAbsolute(fromEnv) ? fromEnv : resolve(cwd, fromEnv));

  if (envPath && !existsSync(envPath)) {
    throw new DeployError(`FROGBOT_CONFIG_PATH points to a missing file: ${envPath}`);
  }

  const configPath = envPath || findConfigFile(cwd);

  if (!configPath) {
    throw new DeployError(
      'No frogbot.config.ts here or in any parent folder. Run this from inside the app.',
    );
  }

  const dir = dirname(configPath);

  return basename(dir) === 'src' ? dirname(dir) : dir;
}

/** The app has a `package.json` and a lockfile the production Dockerfile can install from. */
export function checkLockfile(root: string): PreflightIssue | undefined {
  const has = (name: string) => existsSync(join(root, name));

  if (!has('package.json')) {
    return {
      code: 'NO_PACKAGE_JSON',
      message: `No package.json in ${root}.`,
      fix: 'Run this from inside the app.',
    };
  }

  if (lockfiles.some(has)) return undefined;

  if (has('bun.lock') || has('bun.lockb')) {
    return {
      code: 'NO_LOCKFILE',
      message: "Bun isn't supported yet.",
      fix: 'Run `pnpm install` to make a lockfile.',
    };
  }

  return { code: 'NO_LOCKFILE', message: 'No lockfile.', fix: 'Run `pnpm install` first.' };
}

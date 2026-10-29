import { existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

import { findConfigFile } from 'frogbot/internal';

import { ShareError } from './error.js';
import type { ShareEnv } from './io.js';

const lockfiles = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'];

/** The app's folder: where `frogbot.config.*` lives, or its parent when that is `src/`. */
export function findAppRoot({ cwd, env }: { cwd: string; env: ShareEnv }): string {
  const fromEnv = env.FROGBOT_CONFIG_PATH;
  const envPath = fromEnv && (isAbsolute(fromEnv) ? fromEnv : resolve(cwd, fromEnv));

  if (envPath && !existsSync(envPath)) {
    throw new ShareError(`FROGBOT_CONFIG_PATH points to a missing file: ${envPath}`);
  }

  const configPath = envPath || findConfigFile(cwd);

  if (!configPath) {
    throw new ShareError(
      'No frogbot.config.ts here or in any parent folder. Run share from inside the app.',
    );
  }

  const dir = dirname(configPath);

  return basename(dir) === 'src' ? dirname(dir) : dir;
}

/** Stops before any network call when Dojo couldn't build the app. */
export function checkAppRoot(root: string): void {
  const has = (name: string) => existsSync(join(root, name));

  if (!has('package.json')) throw new ShareError(`No package.json in ${root}.`);

  if (lockfiles.some(has)) return;

  if (has('bun.lock') || has('bun.lockb')) {
    throw new ShareError("Bun isn't supported yet; run `pnpm install` to make a lockfile.");
  }

  throw new ShareError('No lockfile: run `pnpm install` first.');
}

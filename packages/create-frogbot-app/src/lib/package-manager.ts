import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { PackageManager } from '../types.js';

export function detectPackageManager(
  userAgent = process.env.npm_config_user_agent,
): PackageManager {
  const name = userAgent?.split('/')[0];

  return name === 'bun' || name === 'pnpm' || name === 'yarn' ? name : 'npm';
}

export function writePnpmWorkspace(dest: string, packageManager: PackageManager): void {
  if (packageManager !== 'pnpm') return;

  fs.writeFileSync(
    path.join(dest, 'pnpm-workspace.yaml'),
    "packages:\n  - '.'\nallowBuilds:\n  sharp: true\n  esbuild: true\nminimumReleaseAgeExclude:\n  - frogbot\n  - '@frogbotai/*'\n",
  );
}

export function installDependencies(dest: string, packageManager: PackageManager): boolean {
  return spawnSync(packageManager, ['install'], { cwd: dest, stdio: 'inherit' }).status === 0;
}

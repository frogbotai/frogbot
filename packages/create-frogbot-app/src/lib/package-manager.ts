import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { PackageManager } from '../types.js';

const INSTALL_COMMANDS: Record<PackageManager, string> = {
  bun: 'bun install',
  npm: 'npm install',
  pnpm: 'pnpm install',
  yarn: 'yarn install',
};

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
  if (!Object.hasOwn(INSTALL_COMMANDS, packageManager)) {
    throw new Error('Unknown package manager.');
  }

  if (process.platform === 'win32') {
    return (
      spawnSync('cmd.exe', ['/d', '/s', '/c', INSTALL_COMMANDS[packageManager]], {
        cwd: dest,
        stdio: 'inherit',
      }).status === 0
    );
  }

  return spawnSync(packageManager, ['install'], { cwd: dest, stdio: 'inherit' }).status === 0;
}

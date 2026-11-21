import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const COMMANDS = ['generate:types', 'generate:importmap'];

/**
 * Writes `src/frogbot-types.ts` and the admin import map with the app's own `frogbot`, so a new app
 * passes `frogbot check` before its first run. Returns false when the binary is missing or a command fails.
 */
export function generateFiles(dest: string): boolean {
  const bin = path.join(dest, 'node_modules', 'frogbot', 'bin.js');

  if (!fs.existsSync(bin)) return false;

  return COMMANDS.every(
    (command) =>
      spawnSync(process.execPath, [bin, command], { cwd: dest, stdio: 'ignore' }).status === 0,
  );
}

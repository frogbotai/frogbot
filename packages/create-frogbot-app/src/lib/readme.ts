import fs from 'node:fs';
import path from 'node:path';

import type { AIProvider, PackageManager } from '../types.js';
import { EXEC_COMMANDS, RUN_COMMANDS } from './package-manager.js';

function block(name: string): RegExp {
  return new RegExp(`^<!-- ${name} -->\\n[\\s\\S]*?^<!-- /${name} -->\\n`, 'gm');
}

function marker(name: string): RegExp {
  return new RegExp(`^<!-- /?${name} -->\\n`, 'gm');
}

/**
 * Fits the template's README to the chosen flags: keeps `<!-- ai -->` or `<!-- no-ai -->`
 * blocks, and writes `npm run`, `npm install` and `npx` with the chosen package manager.
 */
export function applyReadme(
  dest: string,
  { ai, packageManager }: { ai: AIProvider; packageManager: PackageManager },
): void {
  const file = path.join(dest, 'README.md');

  if (!fs.existsSync(file)) return;

  const [kept, dropped] = ai === 'none' ? ['no-ai', 'ai'] : ['ai', 'no-ai'];
  const readme = fs
    .readFileSync(file, 'utf8')
    .replace(block(dropped), '')
    .replace(marker(kept), '')
    .replace(/\n{3,}/g, '\n\n')
    .replaceAll('npm run ', `${RUN_COMMANDS[packageManager]} `)
    .replaceAll('npm install', `${packageManager} install`)
    .replaceAll('npx ', `${EXEC_COMMANDS[packageManager]} `);

  fs.writeFileSync(file, readme);
}

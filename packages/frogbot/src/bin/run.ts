import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { tsImport } from 'tsx/esm/api';

import { getCachedFrogBot } from '../getFrogBot.js';

export async function runScript(args: string[]): Promise<never> {
  const file = args[0];

  if (!file) {
    console.error('[frogbot] usage: frogbot run <file> [args...]');

    process.exit(2);
  }

  const absPath = path.resolve(process.cwd(), file);

  if (!existsSync(absPath)) {
    console.error(`[frogbot] run: file not found: ${file}`);

    process.exit(1);
  }

  process.argv = [process.execPath, absPath, ...args.slice(1)];

  try {
    await tsImport(pathToFileURL(absPath).href, import.meta.url);

    await getCachedFrogBot()?.destroy();
  } catch (error) {
    console.error(`[frogbot] run failed: ${file}`);
    console.error(error);

    process.exit(1);
  }

  process.exit(0);
}

import { loadConfig } from '../config/load.js';
import { generateImportMap } from '../importMap/index.js';
import { runNext } from './runNext.js';

export async function start(args: string[] = []) {
  try {
    const config = await loadConfig({ cwd: process.cwd(), mode: 'codegen' });
    if (config.admin?.importMap?.autoGenerate !== false) {
      const result = await generateImportMap(await config._internal.payloadConfig, { dryRun: true });
      if (result?.changed) {
        process.stderr.write(
          '[frogbot] import map is stale; run `frogbot generate:importmap` before starting production\n',
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[frogbot] could not check import map: ${message}\n`);
  }
  runNext('start', args);
}

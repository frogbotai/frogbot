import { loadConfig } from '../config/load.js';
import { generateImportMap as generate } from './generateImportMap/index.js';

/** `frogbot generate:importmap`: writes the admin import map, and resolves to its path and whether it changed. */
export async function generateImportMap(): Promise<{ path: string | null; changed: boolean }> {
  const frogbotConfig = await loadConfig({ cwd: process.cwd(), mode: 'codegen' });
  const result = await generate(await frogbotConfig._internal.payloadConfig);

  if (result) {
    console.log(
      `[frogbot] import map ${result.changed ? 'written to' : 'unchanged at'} ${result.outputPath}`,
    );
  }

  return { path: result?.outputPath ?? null, changed: Boolean(result?.changed) };
}

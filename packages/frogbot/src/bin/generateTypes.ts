import { loadConfig, resolveConfigDir } from '../config/load.js';
import { writeGeneratedTypes } from '../typegen/index.js';

/** `frogbot generate:types`: writes `frogbot-types.ts`, and resolves to its path and whether it changed. */
export async function generateTypes(): Promise<{ path: string; changed: boolean }> {
  const cwd = process.cwd();
  const frogbotConfig = await loadConfig({ cwd, mode: 'codegen' });
  const { outputPath, changed } = await writeGeneratedTypes(
    frogbotConfig,
    resolveConfigDir(cwd) ?? cwd,
  );

  console.log(`[frogbot] types ${changed ? 'written to' : 'unchanged at'} ${outputPath}`);

  return { path: outputPath, changed };
}

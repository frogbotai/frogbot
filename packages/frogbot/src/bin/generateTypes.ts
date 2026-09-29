import { loadConfig, resolveConfigDir } from '../config/load.js';
import { writeGeneratedTypes } from '../typegen/index.js';
import { formatCliError } from './formatCliError.js';

export async function generateTypes(): Promise<void> {
  const cwd = process.cwd();

  try {
    const frogbotConfig = await loadConfig({ cwd, mode: 'codegen' });
    const { outputPath, changed } = await writeGeneratedTypes(
      frogbotConfig,
      resolveConfigDir(cwd) ?? cwd,
    );

    if (changed) {
      console.log(`[frogbot] types written to ${outputPath}`);
    } else {
      console.log(`[frogbot] types unchanged at ${outputPath}`);
    }
  } catch (err) {
    console.error(formatCliError(err));
    process.exit(1);
  }
}

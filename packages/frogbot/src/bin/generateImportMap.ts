import { loadConfig } from '../config/load.js';
import { formatCliError } from './formatCliError.js';
import { generateImportMap as generate } from './generateImportMap/index.js';

export async function generateImportMap(): Promise<void> {
  const cwd = process.cwd();

  try {
    const frogbotConfig = await loadConfig({ cwd, mode: 'codegen' });
    const payloadConfig = await frogbotConfig._internal.payloadConfig;
    const result = await generate(payloadConfig);

    if (result?.changed) {
      console.log(`[frogbot] import map written to ${result.outputPath}`);
    } else if (result) {
      console.log(`[frogbot] import map unchanged at ${result.outputPath}`);
    }
  } catch (err) {
    console.error(formatCliError(err));
    process.exit(1);
  }
}

import { loadConfig } from '../config/load.js';
import { generateImportMap as generate } from '../importMap/index.js';

export async function generateImportMap(): Promise<void> {
  const cwd = process.cwd();

  try {
    const frogbotConfig = await loadConfig(cwd);
    const payloadConfig = await frogbotConfig._internal.payloadConfig;
    const result = await generate(payloadConfig);

    if (result?.changed) {
      console.log(`[frogbot] import map written to ${result.outputPath}`); // eslint-disable-line no-console
    } else if (result) {
      console.log(`[frogbot] import map unchanged at ${result.outputPath}`); // eslint-disable-line no-console
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[frogbot] ${message}`); // eslint-disable-line no-console
    process.exit(1);
  }
}

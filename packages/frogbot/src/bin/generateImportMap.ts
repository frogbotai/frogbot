import { loadConfig } from '../config/load.js';
import { generateImportMap as generate } from '../importMap/index.js';

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
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[frogbot] ${message}`);  
    process.exit(1);
  }
}

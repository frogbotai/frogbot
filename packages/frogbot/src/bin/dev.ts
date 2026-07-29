import { loadConfig } from '../config/load.js';
import { generateImportMap } from '../importMap/index.js';
import { runNext } from './runNext.js';

export async function dev(args: string[] = []) {
  const config = await loadConfig({ cwd: process.cwd(), mode: 'codegen' });
  if (config.admin?.importMap?.autoGenerate !== false) {
    await generateImportMap(await config._internal.payloadConfig);
  }
  runNext('dev', args);
}

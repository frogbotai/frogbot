#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const url = pathToFileURL(dirname).toString() + '/';

const nodeModule = await import('node:module');
if (typeof nodeModule.default.registerHooks === 'function') {
  nodeModule.default.registerHooks = undefined;
}

const { tsImport } = await import('tsx/esm/api');

try {
  const { bin } = await tsImport('./dist/bin/index.js', url);
  await bin();
} catch (err) {
  console.error('[frogbot] error:', err);
  process.exit(1);
}

#!/usr/bin/env node
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ROOT } from './workspace.mjs';

const FROGBOT = path.join(ROOT, 'packages', 'frogbot');

const nodeModule = await import('node:module');

if (typeof nodeModule.default.registerHooks === 'function') {
  nodeModule.default.registerHooks = undefined;
}

const require = createRequire(path.join(FROGBOT, 'package.json'));
const { tsImport } = await import(pathToFileURL(require.resolve('tsx/esm/api')).href);
const base = pathToFileURL(`${FROGBOT}/`).href;

const { loadConfig } = await tsImport('./dist/config/load.js', base);
const { generateImportMap } = await tsImport('./dist/bin/generateImportMap/index.js', base);

const config = await loadConfig({ cwd: process.cwd(), mode: 'codegen' });

const result = await generateImportMap(await config._internal.payloadConfig, {
  dryRun: !process.argv.includes('--write'),
});

console.log(JSON.stringify({ changed: Boolean(result?.changed) }));

process.exit(0);

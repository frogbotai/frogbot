#!/usr/bin/env node
const minimumNode = '24.21.0';
const [major, minor, patch] = process.versions.node.split('.').map(Number);
const [minMajor, minMinor, minPatch] = minimumNode.split('.').map(Number);

if (
  major < minMajor ||
  (major === minMajor && (minor < minMinor || (minor === minMinor && patch < minPatch)))
) {
  console.error(
    `[frogbot] error: FrogBot needs Node.js ${minimumNode} or newer, but this is Node.js ${process.versions.node}. Upgrade Node.js (in Docker, set NODE_VERSION to 24).`,
  );

  process.exit(1);
}

const { default: path } = await import('node:path');
const { fileURLToPath, pathToFileURL } = await import('node:url');

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const url = pathToFileURL(dirname).toString() + '/';

const nodeModule = await import('node:module');
if (typeof nodeModule.default.registerHooks === 'function') {
  nodeModule.default.registerHooks = undefined;
}

const { tsImport } = await import('tsx/esm/api');

try {
  const { bin } = await tsImport('./dist/cli/bin.js', url);
  await bin();
} catch (err) {
  console.error('[frogbot] error:', err);
  process.exit(1);
}

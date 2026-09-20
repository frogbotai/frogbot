import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('packages/ui/src');
const payloadImports = {
  'exports/client/index.ts': '@payloadcms/ui',
  'exports/rsc/index.ts': '@payloadcms/ui/rsc',
  'exports/shared/index.ts': '@payloadcms/ui/shared',
};
const forbidden = [
  'process.env',
  '@tauri-apps/',
  '@capacitor/',
  'electron',
  'expo-',
  'next/',
  'FrogBot Pro',
  'firmware.ai',
  'frogbot.ai/assets',
];
const files = fs
  .readdirSync(root, { recursive: true })
  .filter((file) => /\.(?:ts|tsx|css)$/.test(file));

for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const value of forbidden) assert.ok(!source.includes(value), `${file} contains ${value}`);

  const imports = source.match(/@payloadcms\/[\w/-]+/g) ?? [];
  const payloadOccurrences = source.match(/@payloadcms\//g) ?? [];
  const allowedImport = payloadImports[file];

  assert.equal(
    imports.length,
    payloadOccurrences.length,
    `${file} contains an invalid @payloadcms/ path`,
  );

  for (const value of imports) {
    assert.equal(value, allowedImport, `${file} contains ${value}`);
  }
}

console.log(`[check-ui-architecture] ${files.length} source files passed.`);

#!/usr/bin/env node
// Branding gate: user-visible + generated scaffold files must never
// mention Payload. Scans the template, the packed create-frogbot-app
// template, and both examples. Exits non-zero with file:line output.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const roots = [
  'templates/blank',
  'packages/create-frogbot-app/dist/templates/blank',
  'examples/simple',
  'examples/standalone',
];

const skipDirs = new Set(['node_modules', '.next', '.git', 'dist']);
const skipFiles = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', '.env', '.env.local']);
const skipPatterns = [/^frogbot\.db/, /\.tsbuildinfo$/, /\.(png|jpg|jpeg|gif|ico|woff2?)$/];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) yield* walk(path.join(dir, entry.name));
      continue;
    }
    if (skipFiles.has(entry.name)) continue;
    if (skipPatterns.some((re) => re.test(entry.name))) continue;
    yield path.join(dir, entry.name);
  }
}

let failures = 0;
let scanned = 0;

for (const root of roots) {
  const abs = path.join(repoRoot, root);
  if (!fs.existsSync(abs)) {
    console.warn(`[check-branding] skipping missing root: ${root}`);
    continue;
  }
  for (const file of walk(abs)) {
    scanned++;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/payload/i.test(line)) {
        failures++;
        console.error(`${path.relative(repoRoot, file)}:${i + 1}: ${line.trim()}`);
      }
    });
  }
}

if (failures > 0) {
  console.error(`\n[check-branding] FAIL — ${failures} Payload reference(s) found.`);
  process.exit(1);
}
console.log(`[check-branding] OK — ${scanned} files scanned, zero Payload references.`);

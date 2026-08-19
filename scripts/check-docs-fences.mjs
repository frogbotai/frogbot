#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'docs');

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(file);
    else if (entry.name.endsWith('.mdx')) yield file;
  }
}

const failures = [];
const plainTextLanguages = new Set(['text', 'txt', 'plaintext']);
const commandPrefixes = [
  'npm ',
  'npx ',
  'pnpm ',
  'yarn ',
  'bun ',
  'node ',
  'tsx ',
  'git ',
  'cd ',
  'curl ',
  'wget ',
  'docker ',
  'kubectl ',
  'make ',
  'just ',
  'sh ',
  'bash ',
  'zsh ',
  'fish ',
];
let files = 0;
let fences = 0;

for (const file of walk(root)) {
  files++;
  let open;
  const lines = fs.readFileSync(file, 'utf8').split('\n');

  lines.forEach((line, index) => {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!match) {
      if (open && !open.hasContent && line.trim() !== '') {
        open.hasContent = true;
        const content = line.trimStart();
        if (
          plainTextLanguages.has(open.language) &&
          commandPrefixes.some((prefix) => content.startsWith(prefix))
        ) {
          failures.push(`${path.relative(process.cwd(), file)}:${index + 1}`);
        }
      }
      return;
    }

    const marker = match[1];
    if (open) {
      if (marker[0] === open.char && marker.length >= open.length && match[2].trim() === '') {
        open = undefined;
      }
      return;
    }

    const info = match[2].trim();
    open = {
      char: marker[0],
      length: marker.length,
      language: info.split(/\s+/, 1)[0],
      hasContent: false,
    };
    fences++;
    if (info === '') failures.push(`${path.relative(process.cwd(), file)}:${index + 1}`);
  });
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  console.error(`\n[check-docs-fences] FAIL - ${failures.length} fence issue(s) found.`);
  process.exit(1);
}

console.log(`[check-docs-fences] OK - ${files} files and ${fences} fences scanned.`);

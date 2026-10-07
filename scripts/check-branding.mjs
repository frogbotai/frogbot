#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/workspace.mjs';

export const ALLOWLIST = [
  {
    file: 'skills/frogbot/reference/PLUGIN-DEVELOPMENT.md',
    heading: '## Wrapping Payload field factories',
    reason: 'plugin authors wrap upstream field factories',
  },
];

const SCAFFOLD_ROOTS = [
  'templates/blank',
  'packages/create-frogbot-app/dist/templates/blank',
  'examples',
];

const SCAFFOLD_PATTERN = /Payload|@payloadcms\//;

const DOCS_PATTERN = /\bPayload\b|@payloadcms\//;

const SKIPPED_DIRS = new Set(['node_modules', '.next', '.git', 'dist']);

const SKIPPED_FILES = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  '.env',
  '.env.local',
]);

const SKIPPED_PATTERNS = [
  /^frogbot\.db/,
  /\.tsbuildinfo$/,
  /\.(png|jpe?g|gif|ico|svg|webp|mp4|woff2?)$/,
];

function walk(dir) {
  if (!existsSync(dir)) return [];

  const files = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) files.push(...walk(file));
    } else if (
      entry.isFile() &&
      !SKIPPED_FILES.has(entry.name) &&
      !SKIPPED_PATTERNS.some((pattern) => pattern.test(entry.name))
    ) {
      files.push(file);
    }
  }

  return files;
}

export function brandingFiles({ root = ROOT } = {}) {
  const scaffold = SCAFFOLD_ROOTS.flatMap((dir) => walk(path.join(root, dir))).map((file) => ({
    file,
    pattern: SCAFFOLD_PATTERN,
  }));

  const docs = [
    ...walk(path.join(root, 'docs')),
    ...walk(path.join(root, 'skills')),
    path.join(root, 'README.md'),
    ...walk(path.join(root, 'packages')).filter((file) => path.basename(file) === 'README.md'),
  ]
    .filter(existsSync)
    .map((file) => ({ file, pattern: DOCS_PATTERN }));

  return [...scaffold, ...docs].map(({ file, pattern }) => ({
    file: path.relative(root, file),
    content: readFileSync(file, 'utf8'),
    pattern,
  }));
}

function headingLevel(line) {
  return line.match(/^(#{1,6})\s/)?.[1].length;
}

function allowedLines(lines, heading) {
  const start = lines.indexOf(heading);

  if (start === -1) return undefined;

  const level = headingLevel(heading);
  const end = lines.findIndex((line, index) => index > start && headingLevel(line) <= level);

  return { start, end: end === -1 ? lines.length : end };
}

export function checkBranding({ files, allowlist = ALLOWLIST }) {
  const problems = [];
  const used = new Set();

  for (const { file, content, pattern } of files) {
    const lines = content.split('\n');
    const sections = allowlist
      .filter((entry) => entry.file === file)
      .map((entry) => ({ entry, range: allowedLines(lines, entry.heading) }))
      .filter(({ range }) => range);

    lines.forEach((line, index) => {
      if (!pattern.test(line)) return;

      const section = sections.find(({ range }) => index >= range.start && index < range.end);

      if (section) used.add(section.entry);
      else problems.push({ file, line: index + 1, text: line.trim() });
    });
  }

  for (const entry of allowlist) {
    if (!used.has(entry)) {
      problems.push({
        file: 'scripts/check-branding.mjs',
        line: 1,
        text: `stale allowlist entry ${entry.file} "${entry.heading}": ${entry.reason}`,
      });
    }
  }

  return problems;
}

function main() {
  const files = brandingFiles();
  const problems = checkBranding({ files });

  if (problems.length > 0) {
    for (const { file, line, text } of problems) console.error(`${file}:${line}: ${text}`);

    console.error(`\n[check-branding] FAIL - ${problems.length} Payload reference(s) found.`);
    process.exit(1);
  }

  console.log(`[check-branding] OK - ${files.length} files scanned, zero Payload references.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

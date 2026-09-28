#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { publishablePackages, readJSON, ROOT } from './lib/workspace.mjs';

const SCANNED = /\.(?:c|m)?js$|\.d\.ts$/;

const SPECIFIERS = [
  /^\s*(?:import|export)\s[^'"`;]*?\sfrom\s*['"](\.{1,2}\/[^'"]+)['"]/gm,
  /^\s*import\s*['"](\.{1,2}\/[^'"]+)['"]/gm,
  /\b(?:import|require)\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,
];

const ENTRY_FIELDS = ['main', 'module', 'types', 'typings', 'bin', 'exports'];

function entryNames(dir) {
  const cache = entryNames.cache;

  if (!cache.has(dir)) {
    let names;

    try {
      names = new Set(readdirSync(dir));
    } catch {
      names = new Set();
    }

    cache.set(dir, names);
  }

  return cache.get(dir);
}

entryNames.cache = new Map();

function existsExact(root, target) {
  const segments = path.relative(root, target).split(path.sep);
  let current = root;

  for (const segment of segments) {
    if (segment === '..' || !entryNames(current).has(segment)) return false;

    current = path.join(current, segment);
  }

  return true;
}

function isFile(file) {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

function candidates(from, specifier) {
  const target = path.resolve(path.dirname(from), specifier.split(/[?#]/)[0]);

  if (!from.endsWith('.d.ts')) return [target];

  return [target.replace(/\.(c|m)?js$/, '.d.$1ts'), target];
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);

    if (entry.isDirectory()) yield* walk(file);
    else if (SCANNED.test(entry.name)) yield file;
  }
}

function* stringLeaves(value) {
  if (typeof value === 'string') yield value;
  else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) yield* stringLeaves(child);
  }
}

function checkEntries(pkg, manifest) {
  const problems = [];

  for (const field of ENTRY_FIELDS) {
    for (const entry of stringLeaves(manifest[field])) {
      if (entry.includes('*')) continue;

      const target = path.resolve(pkg.dir, entry);

      if (!existsExact(pkg.dir, target)) {
        problems.push({ file: path.join(pkg.dir, 'package.json'), specifier: entry });
      }
    }
  }

  return problems;
}

function* scannedFiles(pkg, manifest) {
  if (entryNames(pkg.dir).has('dist')) yield* walk(path.join(pkg.dir, 'dist'));

  for (const entry of stringLeaves(manifest.bin)) {
    const file = path.resolve(pkg.dir, entry);

    if (!file.startsWith(path.join(pkg.dir, 'dist') + path.sep) && isFile(file)) yield file;
  }
}

function checkImports(pkg, manifest) {
  const problems = [];

  for (const file of scannedFiles(pkg, manifest)) {
    const source = readFileSync(file, 'utf8');
    const seen = new Set();

    for (const pattern of SPECIFIERS) {
      for (const [, specifier] of source.matchAll(pattern)) {
        if (seen.has(specifier)) continue;

        seen.add(specifier);

        const resolves = candidates(file, specifier).some(
          (target) => isFile(target) && existsExact(pkg.dir, target),
        );

        if (!resolves) problems.push({ file, specifier });
      }
    }
  }

  return problems;
}

export function checkDistImports({ packages = publishablePackages() } = {}) {
  entryNames.cache.clear();

  const problems = [];

  for (const pkg of packages) {
    const source = readJSON(path.join(pkg.dir, 'package.json'));
    const manifest = { ...source, ...source.publishConfig };

    problems.push(...checkEntries(pkg, manifest), ...checkImports(pkg, manifest));
  }

  return problems;
}

function main() {
  const packages = publishablePackages();
  const problems = checkDistImports({ packages });

  if (problems.length === 0) {
    console.log(
      `✔ Every import and entry point in ${packages.length} packages matches its file name exactly.`,
    );

    return;
  }

  console.error(
    '✖ These imports or entry points do not match a file name exactly (letter case included):\n',
  );

  for (const { file, specifier } of problems) {
    console.error(`  ${path.relative(ROOT, file)} → ${specifier}`);
  }

  console.error(
    `\n${problems.length} mismatches. Rebuild with \`pnpm build\` or fix the import, then rerun.`,
  );

  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

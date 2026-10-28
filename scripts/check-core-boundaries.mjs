#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/workspace.mjs';

export const BASELINE = 'scripts/core-boundaries-baseline.json';

const CORE = 'packages/frogbot/src';

const PLUGINS = 'packages/plugins';

const TICKET = /^\d+[a-z]?$/;

const SKIPPED = /\.spec\.[^/]+$|\.test-d\.ts$/;

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function literal(match) {
  return { match, pattern: new RegExp(escape(match)) };
}

export function coreBoundaryPatterns({ root = ROOT } = {}) {
  const dir = path.join(root, PLUGINS);
  const plugins = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('plugin-'))
        .map((entry) => entry.name)
        .sort()
    : [];

  return [
    literal('@frogbotai/plugin-'),
    ...plugins.map((name) => ({
      match: name,
      pattern: new RegExp(`(?<![\\w-])${escape(name)}(?![\\w-])`),
    })),
    literal('apiKeyId'),
    literal('api-keys/'),
    literal('frogbotCapture'),
    { match: '_roles', pattern: /(?<![\w$])_roles\b/ },
  ];
}

function walk(dir) {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);

    if (entry.isDirectory()) return walk(file);

    return entry.isFile() && !SKIPPED.test(entry.name) ? [file] : [];
  });
}

export function coreFiles({ root = ROOT } = {}) {
  return walk(path.join(root, CORE))
    .map((file) => ({
      file: path.relative(root, file).split(path.sep).join('/'),
      content: readFileSync(file, 'utf8'),
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

function baselineProblems(baseline) {
  if (!Array.isArray(baseline)) {
    return [`${BASELINE}: expected an array of { file, match, ticket }`];
  }

  const problems = [];
  const seen = new Set();

  baseline.forEach((entry, index) => {
    const valid =
      entry !== null &&
      typeof entry === 'object' &&
      Object.keys(entry).sort().join() === 'file,match,ticket' &&
      typeof entry.file === 'string' &&
      typeof entry.match === 'string' &&
      typeof entry.ticket === 'string' &&
      TICKET.test(entry.ticket);

    if (!valid) {
      problems.push(
        `${BASELINE}: entry ${index} must be { file, match, ticket } with a ticket key such as "361"`,
      );

      return;
    }

    const key = `${entry.file}\0${entry.match}`;

    if (seen.has(key)) problems.push(`${BASELINE}: duplicate entry ${entry.file} "${entry.match}"`);

    seen.add(key);
  });

  return problems;
}

export function checkCoreBoundaries({ files, patterns, baseline }) {
  const problems = baselineProblems(baseline);

  if (problems.length > 0) return problems;

  const allowed = new Set(baseline.map(({ file, match }) => `${file}\0${match}`));
  const found = new Set();

  for (const { file, content } of files) {
    content.split('\n').forEach((line, index) => {
      for (const { match, pattern } of patterns) {
        if (!pattern.test(line)) continue;

        const key = `${file}\0${match}`;

        found.add(key);

        if (!allowed.has(key)) {
          problems.push(
            `${file}:${index + 1}: core names "${match}"; move it into a plugin (CONTRIBUTING.md#core-or-plugin)`,
          );
        }
      }
    });
  }

  for (const { file, match, ticket } of baseline) {
    if (!found.has(`${file}\0${match}`)) {
      problems.push(
        `${BASELINE}: ${file} no longer contains "${match}" (ticket ${ticket}); delete this entry`,
      );
    }
  }

  return problems;
}

function main() {
  const files = coreFiles();
  const baseline = JSON.parse(readFileSync(path.join(ROOT, BASELINE), 'utf8'));
  const problems = checkCoreBoundaries({ files, patterns: coreBoundaryPatterns(), baseline });

  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);

    console.error(`\n[check-core-boundaries] FAIL - ${problems.length} problem(s).`);
    process.exit(1);
  }

  console.log(
    `[check-core-boundaries] OK - ${files.length} files scanned, ${baseline.length} baselined hit(s).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

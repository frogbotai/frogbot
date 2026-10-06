#!/usr/bin/env node
// check: full-only
// `pnpm check test-types [--write]` typechecks `test/` with `test/tsconfig.json` against
// `test/typecheck-baseline.json`, which counts the known errors per file and error code. It
// prints the errors of every file and code over its count, and every count that dropped, so the
// baseline only shrinks. `--write` lowers the dropped counts, and refuses while any count is
// over; with no baseline file it writes one from every current error. Needs built packages.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/workspace.mjs';

export const BASELINE = 'test/typecheck-baseline.json';

export const TSCONFIG = 'test/tsconfig.json';

export const HEAP_MB = 16_384;

export const WRITE_LINE = `run \`pnpm check test-types --write\` to lower ${BASELINE}`;

const USAGE = 'usage: pnpm check test-types [--write]';

const MAX_BUFFER = 256 * 1024 * 1024;

const LOCATED = /^(\S.*?)\((\d+),\d+\): error (TS\d+): (.*)$/;

const GLOBAL = /^error (TS\d+): (.*)$/;

// tsc prints one `file(line,col): error TSxxxx: message` line per error, with indented
// continuation lines, and `error TSxxxx: message` for config errors, which never go in a baseline.
export function parseTsc(output) {
  const errors = [];
  const global = [];

  for (const line of output.split(/\r?\n/)) {
    const located = LOCATED.exec(line);

    if (located) {
      const [, file, row, code, message] = located;

      errors.push({ file: file.split(path.sep).join('/'), line: Number(row), code, message });

      continue;
    }

    const config = GLOBAL.exec(line);

    if (config) global.push(`${TSCONFIG} ${config[1]} ${config[2]}`);
  }

  return { errors, global };
}

export function countErrors(errors) {
  const counts = {};

  for (const { file, code } of errors) {
    counts[file] ??= {};
    counts[file][code] = (counts[file][code] ?? 0) + 1;
  }

  return sortCounts(counts);
}

function sortCounts(counts) {
  return Object.fromEntries(
    Object.keys(counts)
      .sort()
      .map((file) => [
        file,
        Object.fromEntries(
          Object.keys(counts[file])
            .sort()
            .map((code) => [code, counts[file][code]]),
        ),
      ]),
  );
}

// `over` lists each file and code with more errors than the baseline allows, `dropped` each one
// with fewer, a missing entry counting as 0.
export function compareBaseline({ counts, baseline }) {
  const over = [];
  const dropped = [];
  const files = [...new Set([...Object.keys(counts), ...Object.keys(baseline)])].sort();

  for (const file of files) {
    const found = counts[file] ?? {};
    const allowed = baseline[file] ?? {};
    const codes = [...new Set([...Object.keys(found), ...Object.keys(allowed)])].sort();

    for (const code of codes) {
      const entry = { file, code, count: found[code] ?? 0, baseline: allowed[code] ?? 0 };

      if (entry.count > entry.baseline) over.push(entry);
      else if (entry.count < entry.baseline) dropped.push(entry);
    }
  }

  return { over, dropped };
}

// The baseline with every dropped count lowered, entries at 0 removed.
export function lowerBaseline({ counts, baseline }) {
  const lowered = {};

  for (const [file, codes] of Object.entries(baseline)) {
    for (const [code, allowed] of Object.entries(codes)) {
      const count = Math.min(allowed, counts[file]?.[code] ?? 0);

      if (count === 0) continue;

      lowered[file] ??= {};
      lowered[file][code] = count;
    }
  }

  return sortCounts(lowered);
}

export function reportLines({ errors, over, dropped }) {
  const lines = over.flatMap(({ file, code, count, baseline }) => [
    `${file} ${code} ${count} errors, baseline ${baseline}`,
    ...errors
      .filter((error) => error.file === file && error.code === code)
      .map((error) => `${error.file}:${error.line} ${error.code} ${error.message}`),
  ]);

  const fixed = dropped.map(
    ({ file, code, count, baseline }) => `${file} ${code} ${count} errors, baseline ${baseline}`,
  );

  return fixed.length > 0 ? [...lines, ...fixed, WRITE_LINE] : lines;
}

export function baselineTotal(baseline) {
  return Object.values(baseline)
    .flatMap((codes) => Object.values(codes))
    .reduce((total, count) => total + count, 0);
}

function tsc() {
  const heap = `--max-old-space-size=${HEAP_MB}`;
  const result = spawnSync(
    path.join(ROOT, 'node_modules', '.bin', 'tsc'),
    ['-p', TSCONFIG, '--noEmit', '--pretty', 'false'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_OPTIONS: process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ${heap}` : heap,
      },
      maxBuffer: MAX_BUFFER,
    },
  );

  const parsed = parseTsc(result.stdout ?? '');

  if (result.status !== 0 && parsed.errors.length === 0 && parsed.global.length === 0) {
    parsed.global.push(
      (result.error?.message ?? result.stderr?.trim()) || `tsc exited with code ${result.status}`,
    );
  }

  return parsed;
}

function writeBaseline(baseline) {
  writeFileSync(path.join(ROOT, BASELINE), `${JSON.stringify(baseline, null, 2)}\n`);
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');

  if (args.some((arg) => arg !== '--write')) {
    console.log(USAGE);
    process.exitCode = 2;
    return;
  }

  const { errors, global } = tsc();

  if (global.length > 0) {
    console.log(global.join('\n'));
    process.exitCode = 1;
    return;
  }

  const counts = countErrors(errors);
  const file = path.join(ROOT, BASELINE);

  if (write && !existsSync(file)) {
    writeBaseline(counts);
    console.log(`${BASELINE}: ${errors.length} errors in ${Object.keys(counts).length} files`);
    return;
  }

  const baseline = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const { over, dropped } = compareBaseline({ counts, baseline });

  if (write && over.length === 0) {
    const lowered = lowerBaseline({ counts, baseline });

    writeBaseline(lowered);
    console.log(
      `${BASELINE}: ${baselineTotal(lowered)} errors in ${Object.keys(lowered).length} files`,
    );
    return;
  }

  if (over.length === 0 && dropped.length === 0) return;

  console.log(reportLines({ errors, over, dropped: write ? [] : dropped }).join('\n'));
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

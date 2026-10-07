#!/usr/bin/env node
// check: full-only
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { importMaps, openLog } from './check.mjs';
import { acquireSlot } from './lib/slot.mjs';
import { readJSON, ROOT } from './lib/workspace.mjs';

export const BASELINE = 'test/typecheck-baseline.json';

export const TSCONFIG = 'test/tsconfig.json';

export const HEAP_MB = 16_384;

export const PROGRAM_MB = 2_048;

export const MEMORY_SHARE = 0.25;

export const ELSEWHERE = {
  'test/types':
    'the `typecheck` scripts of `frogbot`, `sdk`, `ui`, `richtext-lexical`, `plugin-seo`',
  'test/e2e/fixtures/sdk-frontend': '`test/e2e/sdkPackaging.e2e.spec.ts`',
};

const ALWAYS_EXCLUDED = ['node_modules', 'dist', '.tmp'];

export const WRITE_LINE = `run \`pnpm check test-types --write\` to lower ${BASELINE}`;

const USAGE = 'usage: pnpm check test-types [--write]';

const LOCATED = /^(\S.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

const GLOBAL = /^error (TS\d+): (.*)$/;

const AUGMENTS = /^declare module ['"]frogbot(?:\/[^'"]*)?['"]/m;

const NEXT_TYPES = '.next/';

export function parseTsc(output, tsconfig = TSCONFIG) {
  const errors = [];
  const global = [];

  for (const line of output.split(/\r?\n/)) {
    const located = LOCATED.exec(line);

    if (located) {
      const [, file, row, column, code, message] = located;

      errors.push({
        file: file.split(path.sep).join('/'),
        line: Number(row),
        column: Number(column),
        code,
        message,
      });

      continue;
    }

    const config = GLOBAL.exec(line);

    if (config) global.push(`${tsconfig} ${config[1]} ${config[2]}`);
  }

  return { errors, global };
}

export function mergeErrors(lists) {
  const seen = new Set();

  return lists.flat().filter(({ file, line, column, code }) => {
    const key = `${file}:${line}:${column}:${code}`;

    if (seen.has(key)) return false;

    seen.add(key);

    return true;
  });
}

function nearestDir(file, dirs) {
  return dirs
    .filter((dir) => file.startsWith(`${dir}/`))
    .reduce((nearest, dir) => (dir.length > nearest.length ? dir : nearest), '');
}

export function layoutProblems({ programs, augmented }) {
  const dirs = programs.map(({ config }) => path.posix.dirname(config));
  const owner = (file) => nearestDir(file, dirs);
  const nested = [...dirs, ...Object.keys(ELSEWHERE)];

  return [
    ...programs.flatMap(({ config, exclude }) => {
      const dir = path.posix.dirname(config);
      const inside = nested.filter((child) => owner(child) === dir);
      const excluded = exclude.map((entry) => path.posix.join(dir, entry));

      return [
        ...inside
          .filter((child) => !excluded.includes(child))
          .map(
            (child) =>
              `${config} compiles ${child} again; add "${path.posix.relative(dir, child)}" to its exclude`,
          ),
        ...exclude
          .filter(
            (entry) =>
              !ALWAYS_EXCLUDED.includes(entry) && !inside.includes(path.posix.join(dir, entry)),
          )
          .map((entry) => `${config} excludes "${entry}", which has no tsconfig.json`),
      ];
    }),
    ...augmented
      .filter((file) => owner(file) === 'test')
      .map(
        (file) =>
          `${file} augments frogbot for all of ${TSCONFIG}; give its folder a tsconfig.json`,
      ),
  ];
}

export function stableConfig(config, { dir, buildInfo }) {
  const include = config.include ?? [];

  if (
    !include.some((entry) => entry.startsWith(NEXT_TYPES)) &&
    !config.compilerOptions?.incremental
  ) {
    return undefined;
  }

  return {
    extends: path.join(dir, 'tsconfig.json'),
    compilerOptions: { tsBuildInfoFile: buildInfo },
    include: include
      .filter((entry) => !entry.startsWith(NEXT_TYPES))
      .map((entry) => path.join(dir, entry)),
  };
}

export function poolSize({
  cores = os.availableParallelism(),
  memoryMB = os.totalmem() / 2 ** 20,
} = {}) {
  return Math.max(1, Math.min(cores, Math.floor((memoryMB * MEMORY_SHARE) / PROGRAM_MB)));
}

export function discoverPrograms(root = ROOT) {
  const configs = [];
  const sources = [];
  const augmented = [];

  const walk = (dir) => {
    for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const file = path.posix.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.') && !ELSEWHERE[file]) {
          walk(file);
        }
      } else if (entry.name === 'tsconfig.json') {
        configs.push(file);
      } else if (/\.tsx?$/.test(entry.name)) {
        sources.push(file);

        if (AUGMENTS.test(readFileSync(path.join(root, file), 'utf8'))) augmented.push(file);
      }
    }
  };

  walk('test');

  const dirs = configs.map((config) => path.posix.dirname(config));
  const size = Object.fromEntries(dirs.map((dir) => [dir, 0]));

  for (const file of sources) {
    const owner = nearestDir(file, dirs);

    if (owner) size[owner] += 1;
  }

  return {
    programs: configs.sort(
      (a, b) => size[path.posix.dirname(b)] - size[path.posix.dirname(a)] || a.localeCompare(b),
    ),
    augmented: augmented.sort(),
  };
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

function tsc(config, tmp) {
  const dir = path.join(ROOT, path.dirname(config));
  const name = config.replaceAll('/', '_');
  const stable = stableConfig(readJSON(path.join(ROOT, config)), {
    dir,
    buildInfo: path.join(tmp, `${name}.tsbuildinfo`),
  });

  const project = stable ? path.join(tmp, name) : path.join(ROOT, config);

  if (stable) writeFileSync(project, JSON.stringify(stable));

  const heap = `--max-old-space-size=${HEAP_MB}`;

  return new Promise((resolve) => {
    const child = spawn(
      path.join(ROOT, 'node_modules', '.bin', 'tsc'),
      ['-p', project, '--noEmit', '--pretty', 'false'],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          NODE_OPTIONS: process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ${heap}` : heap,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => resolve({ errors: [], global: [`${config} ${error.message}`] }));

    child.on('close', (code) => {
      const parsed = parseTsc(stdout, config);

      if (code !== 0 && parsed.errors.length === 0 && parsed.global.length === 0) {
        parsed.global.push(`${config} ${stderr.trim() || `tsc exited with code ${code}`}`);
      }

      resolve(parsed);
    });
  });
}

async function typecheck() {
  const { programs, augmented } = discoverPrograms();
  const problems = layoutProblems({
    programs: programs.map((config) => ({
      config,
      exclude: readJSON(path.join(ROOT, config)).exclude ?? [],
    })),
    augmented,
  });

  if (problems.length > 0) return { errors: [], global: problems };

  const generated = await importMaps(openLog(['test-types']));

  if (!generated.ok) return { errors: [], global: generated.groups.flat() };

  const tmp = mkdtempSync(path.join(os.tmpdir(), 'frogbot-test-types-'));
  const results = [];
  let next = 0;

  const worker = async () => {
    while (next < programs.length) {
      const index = next++;

      results[index] = await tsc(programs[index], tmp);
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(poolSize(), programs.length) }, worker));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  return {
    errors: mergeErrors(results.map(({ errors }) => errors)),
    global: results.flatMap(({ global }) => global),
  };
}

function writeBaseline(baseline) {
  writeFileSync(path.join(ROOT, BASELINE), `${JSON.stringify(baseline, null, 2)}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');

  if (args.some((arg) => arg !== '--write')) {
    console.log(USAGE);
    process.exitCode = 2;

    return;
  }

  await acquireSlot('test-types');

  const { errors, global } = await typecheck();

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

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

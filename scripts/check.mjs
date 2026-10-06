#!/usr/bin/env node
// `pnpm check [--full]` runs the static checks: prettier (report only), ESLint (a warning or an
// unpruned suppression fails too), a build of every package whose `dist` is missing or older than
// its sources, every missing gitignored test-fixture `importMap.js`, the typecheck of packages
// changed against local `main` (every package with `--full`), then every `scripts/check-*.mjs`.
// A check file with `// check: full-only` in its first 5 lines runs only with `--full` or by name.
// `pnpm check <name> [args]` runs one of those checks. It never runs tests or starts servers.
// Tool output goes to `.idea/tmp/check-<time>.log`; stdout gets a `built N packages` line when
// it built and a `generated N import maps` line when it generated, then one `check: OK` line,
// or at most MAX_LINES `file:line rule message` lines and the log path.
import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateEnv, readJSON, ROOT } from './lib/workspace.mjs';

export const MAX_LINES = 40;

const SCRIPTS = path.join(ROOT, 'scripts');

const TMP = path.join('.idea', 'tmp');

const TYPECHECK_CONCURRENCY = 4;

const LISTED_PACKAGES = 4;

const BUILD_STAMP = path.join('node_modules', '.cache', 'frogbot-build', 'stamp.json');

const FIXTURES = ['test/browser/fixtures', 'test/e2e/fixtures'];

const FIXTURE_DIR = /^test\/(?:browser|e2e)\/fixtures\/[^/]+(?=\/.*\.tsx?$)/;

const IMPORT_MAP_IMPORT = /\bfrom\s+['"](\.{1,2}\/(?:[^'"]*\/)?importMap\.js)['"]/g;

const IMPORT_MAP_SCRIPT = path.join(SCRIPTS, 'lib', 'generate-import-map.mjs');

const IMPORT_MAP_CONCURRENCY = 4;

const FULL_ONLY = '// check: full-only';

const FULL_ONLY_LINES = 5;

const ENV = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' };

const USAGE = 'usage: pnpm check [--full] | pnpm check <name> [args]';

const UNPRUNED_SUPPRESSIONS = 'There are suppressions left that do not occur anymore';

const PRUNE_LINE =
  'eslint-suppressions.json eslint suppressed problems were fixed; run `pnpm lint --prune-suppressions`';

const TSC_LOCATED = /^(?:(\S+) [\w:-]+: )?(\S.*?)\((\d+),\d+\): error (TS\d+): (.*)$/;

const TSC_GLOBAL = /^(?:(\S+) [\w:-]+: )?error (TS\d+): (.*)$/;

export function parseArgs(argv) {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const [first, ...rest] = args;

  if (first === undefined) return { full: false };

  if (!first.startsWith('-')) return { name: first, args: rest };

  const unknown = args.find((arg) => arg !== '--full');

  if (unknown) return { error: `unknown argument "${unknown}"` };

  return { full: true };
}

export function discoverChecks(dir = SCRIPTS) {
  return readdirSync(dir)
    .map((file) => /^check-(.+)\.mjs$/.exec(file)?.[1])
    .filter(Boolean)
    .sort();
}

export function fullOnlyChecks(dir = SCRIPTS) {
  return discoverChecks(dir).filter((name) =>
    readFileSync(path.join(dir, `check-${name}.mjs`), 'utf8')
      .split('\n', FULL_ONLY_LINES)
      .some((line) => line.trim() === FULL_ONLY),
  );
}

export function missingImportMaps({ files, read, exists, ignored }) {
  const dirs = new Set();

  for (const file of files) {
    const dir = FIXTURE_DIR.exec(file)?.[0];

    if (!dir) continue;

    for (const [, specifier] of read(file).matchAll(IMPORT_MAP_IMPORT)) {
      const map = path.posix.join(path.posix.dirname(file), specifier);

      if (!exists(map) && ignored(map)) dirs.add(dir);
    }
  }

  return [...dirs].sort();
}

export function changedPackages({ files, packages }) {
  const nested = packages
    .filter(({ dir }) => dir !== '')
    .sort((a, b) => b.dir.length - a.dir.length);

  const changed = new Set();

  for (const file of files) {
    const owner = nested.find(({ dir }) => file.startsWith(`${dir}/`));

    if (owner?.typecheck) changed.add(owner);
  }

  return [...changed].sort((a, b) => a.name.localeCompare(b.name));
}

export function stalePackages(packages) {
  return packages.filter(
    ({ dist, built, newest }) => !dist || built === undefined || newest > built,
  );
}

export function buildFilters({ stale, changed }) {
  const closures = new Set(changed.map(({ name }) => name));
  const own = stale.map(({ name }) => name).filter((name) => !closures.has(name));
  const filters = [...own.sort(), ...[...closures].sort().map((name) => `${name}...`)];

  return filters.flatMap((filter) => ['--filter', filter]);
}

function lines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

export function eslintLines(json, { root = ROOT } = {}) {
  return JSON.parse(json).flatMap(({ filePath, messages }) =>
    messages.map(({ line, ruleId, message }) => {
      const file = path.relative(root, filePath);

      return `${file}:${line ?? 0} ${ruleId ?? 'eslint'} ${message.split('\n')[0]}`;
    }),
  );
}

export function tscLines(output, { root = ROOT, cwd = root } = {}) {
  const base = (prefix) => (prefix ? path.join(root, prefix) : cwd);

  return lines(output).flatMap((line) => {
    const located = TSC_LOCATED.exec(line);

    if (located) {
      const [, prefix, file, row, code, message] = located;
      const relative = path.relative(root, path.resolve(base(prefix), file));

      return [`${relative}:${row} ${code} ${message}`];
    }

    const global = TSC_GLOBAL.exec(line);

    if (global) {
      const [, prefix, code, message] = global;

      return [`${path.relative(root, base(prefix)) || '.'} ${code} ${message}`];
    }

    return [];
  });
}

export function prettierLines(output) {
  return lines(output).flatMap((line) => {
    const warning = /^\[warn\] (.+)$/.exec(line);

    if (warning && !warning[1].startsWith('Code style issues')) {
      return [`${warning[1]} prettier unformatted`];
    }

    const error = /^\[error\] (\S+): (.+)$/.exec(line);

    if (error) return [`${error[1]} prettier ${error[2]}`];

    return [];
  });
}

export function labelLines(label, output, code) {
  const found = lines(output)
    .filter((line) => !line.startsWith('> '))
    .map((line) => `${label}: ${line}`);

  return found.length > 0 ? found : [`${label}: exited with code ${code}`];
}

function failureLines(label, result, found) {
  return found.length > 0 ? found : labelLines(label, result.output, result.code);
}

export function capLines(groups, max = MAX_LINES) {
  const seen = new Set();

  const unique = groups.map((group) =>
    group.filter((line) => {
      if (seen.has(line)) return false;

      seen.add(line);

      return true;
    }),
  );

  const quota = unique.map(() => 0);
  let left = max;

  for (let round = 0; left > 0 && unique.some((group) => group.length > round); round++) {
    unique.forEach((group, index) => {
      if (left === 0 || group.length <= round) return;

      quota[index] += 1;
      left -= 1;
    });
  }

  const kept = unique.flatMap((group, index) => group.slice(0, quota[index]));
  const total = unique.reduce((sum, group) => sum + group.length, 0);

  return { lines: kept, cut: total - kept.length };
}

export function report({ ok, groups, summary, log }) {
  const { lines: kept, cut } = capLines(groups);
  const more = cut > 0 ? [`… ${cut} more`] : [];

  return [...kept, ...more, ok ? summary : `full log: ${log}`];
}

function seconds(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;

  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
}

function openLog(argv) {
  const stamp = new Date().toISOString().slice(0, 23).replace(/[:.]/g, '-');
  const file = path.join(ROOT, TMP, `check-${stamp}.log`);

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `pnpm check ${argv.join(' ')}\n${ROOT}\n`);

  return file;
}

function record(log, { command, args, output, code, ms }) {
  const shown = [path.isAbsolute(command) ? path.basename(command) : command, ...args].join(' ');

  appendFileSync(log, `\n$ ${shown}\n${output.trimEnd()}\n→ exit ${code} · ${seconds(ms)}\n`);
}

function sh(log, command, args) {
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: ENV,
    maxBuffer: 64 * 1024 * 1024,
  });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`;

  record(log, { command, args, output, code: result.status, ms: performance.now() - started });

  return { code: result.status, stdout: result.stdout ?? '' };
}

function run(log, command, args, { cwd = ROOT, env = ENV } = {}) {
  const started = performance.now();

  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let output = '';
    let done = false;

    const finish = (code, extra = '') => {
      if (done) return;

      done = true;
      output += extra;

      record(log, { command, args, output, code, ms: performance.now() - started });

      resolve({ code, stdout, output });
    };

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      output += chunk;
    });

    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', (error) => finish(null, error.message));
    child.on('close', (code) => finish(code));
  });
}

async function mapLimit(items, limit, work) {
  const results = [];
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next++;

      results[index] = await work(items[index]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));

  return results;
}

function bin(tool) {
  return path.join(ROOT, 'node_modules', '.bin', tool);
}

async function prettier(log) {
  const result = await run(log, bin('prettier'), [
    '--check',
    '--cache',
    '--cache-location',
    path.join(TMP, '.prettiercache'),
    '.',
  ]);

  const found = prettierLines(result.output);

  return {
    ok: true,
    groups: [found],
    summary: found.length > 0 && `prettier ${found.length} unformatted`,
  };
}

async function eslint(log) {
  const result = await run(log, bin('eslint'), [
    '.',
    '--max-warnings=0',
    '--format',
    'json',
    '--cache',
    '--cache-location',
    path.join(TMP, '.eslintcache'),
  ]);

  return eslintResult(result);
}

export function eslintResult(result) {
  const unpruned = result.output.includes(UNPRUNED_SUPPRESSIONS) ? [PRUNE_LINE] : [];
  let found;

  try {
    found = eslintLines(result.stdout);
  } catch {
    found = failureLines('eslint', result, []);
  }

  return {
    ok: result.code === 0,
    groups: [[...found, ...unpruned]],
    summary: `eslint ${found.length} problems`,
  };
}

function changedFiles(log) {
  const base = sh(log, 'git', ['merge-base', 'main', 'HEAD']);
  const ref = base.code === 0 ? base.stdout.trim() : 'HEAD';
  const diff = sh(log, 'git', ['diff', '--name-only', ref]);
  const untracked = sh(log, 'git', ['ls-files', '--others', '--exclude-standard']);

  return [...lines(diff.stdout), ...lines(untracked.stdout)];
}

function workspacePackages(log) {
  const listed = sh(log, 'pnpm', ['ls', '-r', '--depth', '-1', '--json']);

  return JSON.parse(listed.stdout).map(({ name, path: dir }) => {
    const { scripts } = readJSON(path.join(dir, 'package.json'));

    return {
      name,
      dir: path.relative(ROOT, dir).split(path.sep).join('/'),
      typecheck: Boolean(scripts?.typecheck),
      buildable: Boolean(scripts?.build?.includes('scripts/build-package.mjs')),
    };
  });
}

function mtime(file) {
  return statSync(file, { throwIfNoEntry: false })?.mtimeMs;
}

function newestSource(dir) {
  const src = path.join(dir, 'src');
  const files = [
    path.join(dir, 'package.json'),
    ...readdirSync(dir)
      .filter((file) => /^tsconfig.*\.json$/.test(file))
      .map((file) => path.join(dir, file)),
    ...(existsSync(src) ? [src, ...readdirSync(src, { recursive: true })] : []).map((file) =>
      path.resolve(src, file),
    ),
  ];

  return files.reduce((newest, file) => Math.max(newest, mtime(file) ?? 0), 0);
}

function buildState({ name, dir }) {
  const root = path.join(ROOT, dir);

  return {
    name,
    dist: existsSync(path.join(root, 'dist')),
    built: mtime(path.join(root, BUILD_STAMP)),
    newest: newestSource(root),
  };
}

async function build(log, { packages, changed }) {
  const started = performance.now();
  const stale = stalePackages(packages.filter(({ buildable }) => buildable).map(buildState));

  if (stale.length === 0) return { ok: true, groups: [] };

  const filters = buildFilters({ stale, changed: changed.filter(({ buildable }) => buildable) });
  const result = await run(log, 'pnpm', [...filters, 'build']);

  if (result.code !== 0) {
    return { ok: false, groups: [failureLines('build', result, tscLines(result.output))] };
  }

  const noun = stale.length === 1 ? 'package' : 'packages';

  console.log(`built ${stale.length} ${noun} · ${seconds(performance.now() - started)}`);

  return { ok: true, groups: [] };
}

async function importMaps(log) {
  const started = performance.now();
  const listed = sh(log, 'git', ['ls-files', '-z', ...FIXTURES]);

  const dirs = missingImportMaps({
    files: listed.stdout.split('\0').filter(Boolean),
    read: (file) => readFileSync(path.join(ROOT, file), 'utf8'),
    exists: (file) => existsSync(path.join(ROOT, file)),
    ignored: (file) => sh(log, 'git', ['check-ignore', '-q', file]).code === 0,
  });

  if (dirs.length === 0) return { ok: true, groups: [] };

  const results = await mapLimit(dirs, IMPORT_MAP_CONCURRENCY, (dir) =>
    run(log, process.execPath, [IMPORT_MAP_SCRIPT, '--write'], {
      cwd: path.join(ROOT, dir),
      env: generateEnv(),
    }).then((result) => ({ dir, result })),
  );

  const failed = results.filter(({ result }) => result.code !== 0);

  if (failed.length > 0) {
    return {
      ok: false,
      groups: failed.map(({ dir, result }) => labelLines(dir, result.output, result.code)),
    };
  }

  const noun = dirs.length === 1 ? 'import map' : 'import maps';

  console.log(`generated ${dirs.length} ${noun} · ${seconds(performance.now() - started)}`);

  return { ok: true, groups: [] };
}

async function typecheckChanged(log, packages) {
  const names = packages.map(({ name }) => name);

  const summary =
    names.length === 0
      ? 'typecheck none'
      : names.length > LISTED_PACKAGES
        ? `typecheck ${names.length} packages`
        : `typecheck ${names.join(', ')}`;

  if (packages.length === 0) return { ok: true, groups: [], summary };

  const results = await mapLimit(packages, TYPECHECK_CONCURRENCY, async (pkg) => {
    const result = await run(log, 'pnpm', ['--filter', pkg.name, 'typecheck']);

    if (result.code === 0) return { ok: true, lines: [] };

    const found = tscLines(result.output, { cwd: path.join(ROOT, pkg.dir) });

    return { ok: false, lines: failureLines(pkg.name, result, found) };
  });

  return {
    ok: results.every(({ ok }) => ok),
    groups: results.map(({ lines: found }) => found),
    summary,
  };
}

async function typecheckAll(log) {
  const result = await run(log, 'pnpm', ['typecheck']);
  const ok = result.code === 0;
  const groups = ok ? [] : [failureLines('typecheck', result, tscLines(result.output))];

  return { ok, groups, summary: 'typecheck all' };
}

async function check(log, { name, args }) {
  const result = await run(log, process.execPath, [
    path.join('scripts', `check-${name}.mjs`),
    ...args,
  ]);

  return {
    ok: result.code === 0,
    groups: result.code === 0 ? [] : [labelLines(name, result.output, result.code)],
  };
}

async function runAll(log, { checks, full }) {
  const packages = workspacePackages(log);
  const changed = changedPackages({ files: changedFiles(log), packages });
  const [built, ...stages] = await Promise.all([
    build(log, { packages, changed }),
    prettier(log),
    eslint(log),
  ]);

  const generated = built.ok ? await importMaps(log) : built;

  if (!generated.ok) {
    return {
      ok: false,
      groups: [...stages, generated].flatMap(({ groups }) => groups),
      summary: [],
    };
  }

  stages.push(full ? await typecheckAll(log) : await typecheckChanged(log, changed));

  const results = await Promise.all(checks.map((name) => check(log, { name, args: [] })));

  return {
    ok: [...stages, ...results].every(({ ok }) => ok),
    groups: [...stages, ...results].flatMap(({ groups }) => groups),
    summary: [...stages.map(({ summary }) => summary), `${checks.length} checks`],
  };
}

async function runOne(log, { name, args }) {
  const result = await check(log, { name, args });

  return { ...result, summary: [name] };
}

function exit(message) {
  console.error(`check: ${message}`);
  process.exit(2);
}

async function main() {
  const argv = process.argv.slice(2);
  const options = parseArgs(argv);

  if (options.error) exit(`${options.error}. ${USAGE}`);

  const checks = discoverChecks();
  const fullOnly = fullOnlyChecks();

  if (options.name && !checks.includes(options.name)) {
    exit(`unknown check "${options.name}". Checks: ${checks.join(', ')}`);
  }

  const started = performance.now();
  const log = openLog(argv);
  const result = options.name
    ? await runOne(log, options)
    : await runAll(log, {
        checks: options.full ? checks : checks.filter((name) => !fullOnly.includes(name)),
        ...options,
      });

  const summary = [
    'check: OK',
    ...result.summary.filter(Boolean),
    seconds(performance.now() - started),
  ];

  console.log(
    report({ ...result, summary: summary.join(' · '), log: path.relative(ROOT, log) }).join('\n'),
  );

  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

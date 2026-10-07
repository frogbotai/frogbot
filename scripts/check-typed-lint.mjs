#!/usr/bin/env node
// `pnpm check typed-lint [--all] [oxlint args]` runs the type-aware rules in `.oxlintrc.json` on
// oxlint (tsgolint) and prints one `file:line rule message` line per problem. It lints the files
// changed against local `main`, uncommitted and untracked ones included, as Payload's lint-staged
// does; `--all`, or a changed `.oxlintrc.json` or tsconfig, lints the whole repo. Other args go to
// oxlint. Needs built packages.
//
// Known violations are `.oxlintrc.json` overrides that set one rule to "warn" for exact files. A
// warning there passes; an override whose file no longer warns fails, so the list only shrinks.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { changedFiles } from './lib/verify.mjs';
import { ROOT } from './lib/workspace.mjs';

export const CONFIG = '.oxlintrc.json';

const MAX_BUFFER = 256 * 1024 * 1024;

const LINTABLE = /\.(?:[cm]?ts|tsx)$/;

export const SKIP_LINE = 'typed-lint: skipped, no changed .ts or .tsx files';

// A changed file that `.oxlintrc.json` ignores, such as a generated `frogbot-types.ts`, leaves
// nothing to lint; `--no-error-on-unmatched-pattern` keeps that from failing.
export function typedLintArgs(args = [], targets = ['.']) {
  return [...targets, '--no-error-on-unmatched-pattern', '--format', 'json', ...args];
}

// Deleted files are in the diff but have nothing to lint.
export function typedLintTargets(files, exists = (file) => existsSync(path.join(ROOT, file))) {
  return files.filter((file) => LINTABLE.test(file) && exists(file));
}

// A changed lint or TypeScript config changes the types of files the diff doesn't touch.
const CONFIGS = /(?:^|\/)(?:\.oxlintrc|tsconfig[^/]*)\.json$/;

// The oxlint args and targets for `pnpm check typed-lint [args]`, or null when no changed file is
// lintable. `targets` is null for the whole repo.
export function typedLintCommand(args, changed = () => changedFiles(ROOT)) {
  const rest = args.filter((arg) => arg !== '--all');
  const files = rest.length < args.length ? null : changed();

  if (!files || files.some((file) => CONFIGS.test(file))) {
    return { args: typedLintArgs(rest), targets: null };
  }

  const targets = typedLintTargets(files);

  return targets.length > 0 ? { args: typedLintArgs(rest, targets), targets } : null;
}

// The known violations in the linted files: every one for the whole repo, when `targets` is null.
export function exceptions(config, targets) {
  return (config.overrides ?? []).flatMap(({ files, rules }) =>
    Object.entries(rules)
      .filter(([, level]) => level === 'warn')
      .flatMap(([rule]) => files.map((file) => ({ file, rule })))
      .filter(({ file }) => !targets || targets.includes(file)),
  );
}

const ruleName = (code) => code?.replace(/^(\w[\w-]*)\((.+)\)$/, '$1/$2') ?? 'oxlint';

export function typedLintLines({ code, stdout, stderr }, { known = [], root = ROOT } = {}) {
  let diagnostics;

  try {
    ({ diagnostics } = JSON.parse(stdout));
  } catch {
    return [stderr.trim() || stdout.trim() || `oxlint exited with code ${code}`];
  }

  const warned = new Set();
  const found = [];

  for (const { filename, code: id, severity, message, labels } of diagnostics) {
    const file = path.isAbsolute(filename) ? path.relative(root, filename) : filename;
    const rule = ruleName(id);

    if (severity === 'warning') warned.add(`${file} ${rule}`);
    else found.push(`${file}:${labels?.[0]?.span.line ?? 0} ${rule} ${message.split('\n')[0]}`);
  }

  const stale = known
    .filter(({ file, rule }) => !warned.has(`${file} ${rule}`))
    .map(({ file, rule }) => `${file}:0 ${rule} no longer fails; remove it from ${CONFIG}`);

  return [...found, ...stale];
}

function main() {
  const command = typedLintCommand(process.argv.slice(2));

  if (!command) {
    console.log(SKIP_LINE);
    return;
  }

  const result = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'oxlint'), command.args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
  });

  const lines = typedLintLines(
    {
      code: result.status,
      stdout: result.stdout ?? '',
      stderr: result.error ? result.error.message : result.stderr,
    },
    {
      known: exceptions(JSON.parse(readFileSync(path.join(ROOT, CONFIG), 'utf8')), command.targets),
    },
  );

  if (lines.length === 0 && result.status === 0) return;

  console.log(lines.join('\n') || `oxlint exited with code ${result.status}`);

  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

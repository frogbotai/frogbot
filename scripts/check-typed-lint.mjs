#!/usr/bin/env node
// check: full-only
// `pnpm check typed-lint [--all] [eslint args]` runs the type-aware ESLint rules
// (`FROGBOT_LINT=typed` in `eslint.config.js`) with a larger heap and no cache, against
// `eslint-suppressions.typed.json`, and prints one `file:line rule message` line per problem. It
// lints the files changed against local `main`, uncommitted and untracked ones included, as
// Payload's lint-staged does; `--all` lints the whole repo. Other args go to ESLint, for example
// `--prune-suppressions`. Needs built packages.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { eslintLines } from './check.mjs';
import { changedFiles } from './lib/verify.mjs';
import { ROOT } from './lib/workspace.mjs';

export const SUPPRESSIONS = 'eslint-suppressions.typed.json';

export const HEAP_MB = 32_768;

const UNPRUNED_SUPPRESSIONS = 'There are suppressions left that do not occur anymore';

export const PRUNE_LINE = `${SUPPRESSIONS} typed suppressed problems were fixed; run \`pnpm check typed-lint --prune-suppressions\``;

const MAX_BUFFER = 256 * 1024 * 1024;

const LINTABLE = /\.(?:tsx?|m?js)$/;

export const SKIP_LINE = 'typed-lint: skipped, no changed .ts, .tsx, .js or .mjs files';

// ESLint's ignores apply to these too: `--no-warn-ignored` keeps a changed ignored file, such as
// any .js file in the typed run, from failing `--max-warnings=0`.
export function typedLintArgs(args = [], targets = ['.']) {
  return [
    ...targets,
    '--no-warn-ignored',
    '--max-warnings=0',
    '--format',
    'json',
    '--suppressions-location',
    SUPPRESSIONS,
    ...args,
  ];
}

// Deleted files are in the diff but have nothing to lint.
export function typedLintTargets(files, exists = (file) => existsSync(path.join(ROOT, file))) {
  return files.filter((file) => LINTABLE.test(file) && exists(file));
}

// The ESLint args for `pnpm check typed-lint [args]`, or null when no changed file is lintable.
export function typedLintCommand(args, changed = () => changedFiles(ROOT)) {
  const rest = args.filter((arg) => arg !== '--all');

  if (rest.length < args.length) return typedLintArgs(rest);

  const targets = typedLintTargets(changed());

  return targets.length > 0 ? typedLintArgs(rest, targets) : null;
}

export function typedLintEnv(env = process.env) {
  const heap = `--max-old-space-size=${HEAP_MB}`;

  return {
    ...env,
    FROGBOT_LINT: 'typed',
    NODE_OPTIONS: env.NODE_OPTIONS ? `${env.NODE_OPTIONS} ${heap}` : heap,
  };
}

export function typedLintLines({ code, stdout, stderr }) {
  const unpruned = stderr.includes(UNPRUNED_SUPPRESSIONS) ? [PRUNE_LINE] : [];

  try {
    return [...eslintLines(stdout), ...unpruned];
  } catch {
    return [...unpruned, stderr.trim() || `eslint exited with code ${code}`];
  }
}

function main() {
  const args = typedLintCommand(process.argv.slice(2));

  if (!args) {
    console.log(SKIP_LINE);
    return;
  }

  const result = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'eslint'), args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: typedLintEnv(),
    maxBuffer: MAX_BUFFER,
  });

  if (result.status === 0) return;

  console.log(
    typedLintLines({
      code: result.status,
      stdout: result.stdout ?? '',
      stderr: result.error ? result.error.message : result.stderr,
    }).join('\n'),
  );

  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

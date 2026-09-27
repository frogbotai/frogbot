// `pnpm bump <major|minor|patch> [--from <step>] [--list]`
//
// Runs the release gate (install, sync, format, build, services, tests) and
// only then rewrites versions with scripts/bump.mjs. Each step is named so a
// failure can be resumed with `--from <step>` instead of redoing everything.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/workspace.mjs';

export const BUMPS = ['major', 'minor', 'patch'];

export const STEPS = [
  { name: 'install', run: ['pnpm', 'install', '--frozen-lockfile'] },
  { name: 'sync-catalog', run: ['pnpm', 'sync:catalog'] },
  { name: 'lint', run: ['pnpm', 'lint:fix'] },
  { name: 'format', run: ['pnpm', 'prettier:write'] },
  { name: 'build', run: ['pnpm', 'build'] },
  { name: 'services', run: ['pnpm', 'test:services'], docker: true },
  { name: 'test', run: ['pnpm', 'test:release'], docker: true },
  // { name: 'browser', run: ['pnpm', 'test:browser'] },
  { name: 'version', run: (bump) => ['node', 'scripts/bump.mjs', bump] },
];

const DOCKER_WAIT_MS = 120_000;

function sh(cmd, args, options = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...options });
}

function dockerUp() {
  return sh('docker', ['info'], { stdio: 'ignore' }).status === 0;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function ensureDocker() {
  if (dockerUp()) return;

  if (process.platform !== 'darwin') {
    fail('Docker is not running. Start the Docker daemon and rerun.');
  }

  console.log('Docker is not running. Starting Docker Desktop...');

  if (sh('open', ['-ga', 'Docker']).status !== 0) {
    fail('Could not launch Docker Desktop. Install or start it, then rerun.');
  }

  const deadline = Date.now() + DOCKER_WAIT_MS;

  while (Date.now() < deadline) {
    sleep(2000);

    if (dockerUp()) {
      console.log('Docker is ready.\n');

      return;
    }
  }

  fail(`Docker did not become ready within ${DOCKER_WAIT_MS / 1000}s.`);
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function usage() {
  return [
    `Usage: pnpm bump <${BUMPS.join('|')}> [--from <step>] [--list]`,
    `Steps: ${STEPS.map((s) => s.name).join(', ')}`,
  ].join('\n');
}

function parse(argv) {
  const args = { bump: undefined, from: undefined, list: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--') continue;
    else if (arg === '--list') args.list = true;
    else if (arg === '--from') args.from = argv[++i];
    else if (arg.startsWith('--from=')) args.from = arg.slice('--from='.length);
    else if (!args.bump) args.bump = arg;
    else fail(`Unexpected argument "${arg}".\n${usage()}`);
  }

  return args;
}

function main() {
  const args = parse(process.argv.slice(2));

  if (args.list) {
    console.log(usage());

    return;
  }

  if (!BUMPS.includes(args.bump)) fail(usage());

  const start = args.from ? STEPS.findIndex((s) => s.name === args.from) : 0;

  if (start === -1) fail(`Unknown step "${args.from}".\n${usage()}`);

  const steps = STEPS.slice(start);

  // Check prerequisites before spending minutes on install/build.
  if (steps.some((s) => s.docker)) ensureDocker();

  const began = Date.now();

  for (const [i, step] of steps.entries()) {
    const argv = typeof step.run === 'function' ? step.run(args.bump) : step.run;

    console.log(`\n▶ [${start + i + 1}/${STEPS.length}] ${step.name}: ${argv.join(' ')}\n`);

    const t = Date.now();
    const result = sh(argv[0], argv.slice(1));

    if (result.status !== 0) {
      fail(
        `Step "${step.name}" failed${result.error ? ` (${result.error.message})` : ''}.\n` +
          `  Fix it, then resume with: pnpm bump ${args.bump} --from ${step.name}`,
      );
    }

    console.log(`\n✔ ${step.name} (${Math.round((Date.now() - t) / 1000)}s)`);
  }

  console.log(`\n✔ Release gate passed in ${Math.round((Date.now() - began) / 1000)}s.`);
  console.log('  Next: commit the version bump, then run `pnpm release`.\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

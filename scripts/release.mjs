import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/workspace.mjs';

export function releaseSteps({ resume = false } = {}) {
  return [
    ['npm', 'whoami'],
    ...(resume ? [] : [['pnpm', 'install', '--frozen-lockfile']]),
    ['pnpm', 'build'],
    ['pnpm', 'check', 'dist-imports'],
    ['pnpm', '-r', 'publish', '--access', 'public', '--no-git-checks', '--report-summary'],
    ['pnpm', 'release:status'],
  ];
}

export function parseArgs(argv) {
  const args = argv.filter((arg) => arg !== '--');
  const unknown = args.find((arg) => arg !== '--resume');

  if (unknown) return { error: `unknown argument "${unknown}"\nusage: pnpm release [--resume]` };

  return { resume: args.includes('--resume') };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.error) {
    console.error(args.error);
    process.exit(1);
  }

  for (const [command, ...rest] of releaseSteps(args)) {
    console.log(`\n▶ ${[command, ...rest].join(' ')}\n`);

    const result = spawnSync(command, rest, { cwd: ROOT, stdio: 'inherit' });

    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

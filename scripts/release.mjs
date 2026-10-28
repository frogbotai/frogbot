import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/workspace.mjs';
import { releaseNotes } from './release-changelog.mjs';

function exec(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' });

  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? result.error?.message ?? '').trim(),
  };
}

function version() {
  return JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
}

function notesFile(tag) {
  return path.join(os.tmpdir(), `frogbot-release-${tag}.md`);
}

function must(run, command, args) {
  const result = run(command, args);

  if (result.status !== 0) {
    throw new Error(
      `${[command, ...args].join(' ')} failed${result.stderr ? `: ${result.stderr}` : ''}`,
    );
  }

  return result.stdout;
}

function tagCommits(run, tag) {
  const local = run('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}^{commit}`]);
  const remote = must(run, 'git', [
    'ls-remote',
    '--tags',
    'origin',
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ])
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'));

  return {
    head: must(run, 'git', ['rev-parse', 'HEAD']),
    local: local.status === 0 ? local.stdout : undefined,
    remote: (remote.find(([, ref]) => ref.endsWith('^{}')) ?? remote[0])?.[0],
  };
}

function checkTag(tags, tag) {
  for (const where of ['local', 'remote']) {
    if (tags[where] && tags[where] !== tags.head) {
      throw new Error(`${where} tag ${tag} points at ${tags[where].slice(0, 8)}, not HEAD`);
    }
  }
}

export function checkHead({ tag, run = exec }) {
  if (run('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main']).status !== 0) {
    throw new Error('HEAD is not on origin/main; push the version bump first');
  }

  checkTag(tagCommits(run, tag), tag);
}

export function githubRelease({ tag, notes, run = exec, log = console.log }) {
  const existing = run('gh', ['release', 'view', tag, '--json', 'url', '--jq', '.url']);

  if (existing.status === 0) {
    log(`${tag} is already released: ${existing.stdout}`);

    return;
  }

  const tags = tagCommits(run, tag);

  checkTag(tags, tag);

  if (!tags.local) must(run, 'git', ['tag', tag]);
  if (!tags.remote) must(run, 'git', ['push', 'origin', tag]);

  log(
    must(run, 'gh', [
      'release',
      'create',
      tag,
      '--title',
      tag,
      '--notes-file',
      notes,
      '--verify-tag',
    ]),
  );
}

export function releaseSteps({ resume = false } = {}) {
  const tag = () => `v${version()}`;

  return [
    { name: 'npm-whoami', run: ['npm', 'whoami'] },
    { name: 'gh-auth', run: ['gh', 'auth', 'status'] },
    { name: 'fetch', run: ['git', 'fetch', 'origin', 'main'] },
    { name: 'check-head', run: () => checkHead({ tag: tag() }) },
    {
      name: 'notes',
      run: () => writeFileSync(notesFile(tag()), releaseNotes({ version: version() })),
    },
    ...(resume ? [] : [{ name: 'install', run: ['pnpm', 'install', '--frozen-lockfile'] }]),
    { name: 'build', run: ['pnpm', 'build'] },
    { name: 'check-dist-imports', run: ['pnpm', 'check', 'dist-imports'] },
    {
      name: 'publish',
      run: ['pnpm', '-r', 'publish', '--access', 'public', '--no-git-checks', '--report-summary'],
    },
    { name: 'release-status', run: ['pnpm', 'release:status'] },
    {
      name: 'github-release',
      run: () => githubRelease({ tag: tag(), notes: notesFile(tag()) }),
    },
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

  for (const { name, run } of releaseSteps(args)) {
    if (typeof run === 'function') {
      console.log(`\n▶ ${name}\n`);

      try {
        run();
      } catch (error) {
        console.error(`✖ ${error.message}`);
        process.exit(1);
      }

      continue;
    }

    console.log(`\n▶ ${run.join(' ')}\n`);

    const result = spawnSync(run[0], run.slice(1), { cwd: ROOT, stdio: 'inherit' });

    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

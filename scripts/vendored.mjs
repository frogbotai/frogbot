#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/workspace.mjs';

const FIELDS = ['Upstream', 'Path', 'Commit', 'Tag'];

const FIELD = /^- (\w+): (.*)$/;

const FULL_SHA = /^[0-9a-f]{40}$/;

const TABLE_HEADER = /^\|\s*Local\s*\|\s*Upstream\s*\|$/;

const CELL = /(?<!\\)\|/;

const SPAN = /`([^`]+)`/;

const USAGE = 'usage: pnpm vendored [--to <ref>] [--fetch]';

const FETCH_HINT = 'run `pnpm vendored --fetch`';

export function parseManifest(file, source, exists = () => true) {
  const lines = source.split('\n');
  const fields = {};
  const files = [];
  const problems = [];
  let header = -1;

  lines.forEach((line, index) => {
    const field = FIELD.exec(line);

    if (field && FIELDS.includes(field[1]) && !(field[1] in fields)) {
      fields[field[1]] = { value: field[2].replaceAll('`', '').trim(), line: index + 1 };
    }

    if (TABLE_HEADER.test(line.trim())) header = index;
  });

  for (const name of FIELDS) {
    if (!fields[name]) problems.push(`${file}:1 missing \`- ${name}:\` field`);
  }

  if (fields.Commit && !FULL_SHA.test(fields.Commit.value)) {
    problems.push(`${file}:${fields.Commit.line} Commit: must be a full 40-character SHA`);
  }

  if (header === -1) problems.push(`${file}:1 missing the \`| Local | Upstream |\` table`);

  for (let index = header + 2; header !== -1 && index < lines.length; index++) {
    if (!lines[index].startsWith('|')) break;

    const [, local, upstream] = lines[index].split(CELL).map((cell) => SPAN.exec(cell)?.[1]);
    const line = index + 1;

    if (!local || !upstream) {
      problems.push(`${file}:${line} row needs a backticked local and upstream file`);
      continue;
    }

    const localPath = path.posix.join(path.posix.dirname(file), local);

    if (!exists(localPath)) problems.push(`${file}:${line} ${local} is mapped but does not exist`);

    files.push({ local, upstream, line });
  }

  const values = Object.fromEntries(
    Object.entries(fields).map(([name, { value }]) => [name, value]),
  );

  return {
    file,
    dir: path.posix.dirname(file),
    fields: values,
    commitLine: fields.Commit?.line,
    files,
    problems,
  };
}

function gitIn(cwd) {
  return (...args) => {
    try {
      return execFileSync('git', ['-C', cwd, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
      }).trim();
    } catch {
      return null;
    }
  };
}

export function defaultTarget(root) {
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'packages/frogbot/package.json'), 'utf8'),
  );

  const version = manifest.dependencies?.payload?.replace(/^[^\d]*/, '');

  return version ? `v${version}` : null;
}

function staleness(git, manifests, target, targetFound) {
  const stale = [];

  for (const line of (
    git('for-each-ref', '--format=%(refname:short) %(upstream:track)', 'refs/heads') ?? ''
  ).split('\n')) {
    if (/\[behind \d+\]/.test(line)) stale.push(line.trim());
  }

  const tags = new Set(manifests.map((manifest) => manifest.fields.Tag).filter(Boolean));

  for (const tag of tags) {
    if (git('rev-parse', '--verify', '--quiet', `refs/tags/${tag}`) === null) {
      stale.push(`tag ${tag} missing`);
    }
  }

  if (!targetFound && !tags.has(target)) stale.push(`${target} missing`);

  return stale;
}

function fileStatus(git, from, to, upstreamPath, ancestor) {
  const stat = git('diff', '--stat=1000', from, to, '--', upstreamPath);

  if (!stat) return { status: 'unchanged' };

  if (git('cat-file', '-e', `${to}:${upstreamPath}`) === null) {
    const deleted = git('log', '--diff-filter=D', '--format=%h %s', '-1', to, '--', upstreamPath);

    return { status: 'gone', detail: deleted ? `deleted in ${deleted}` : 'not at target' };
  }

  const detail = /\|\s*(.*)$/m.exec(stat)?.[1] ?? '';
  const commits = ancestor
    ? (git('log', '--oneline', `${from}..${to}`, '--', upstreamPath) ?? '')
    : '';

  return { status: 'changed', detail, commits: commits ? commits.split('\n') : [] };
}

function reportManifest(git, manifest, target) {
  const { Path: base, Commit: commit } = manifest.fields;
  const lines = [`${manifest.dir} ← ${base} ${commit.slice(0, 10)} → ${target}`];
  const ancestor = git('merge-base', '--is-ancestor', commit, target) !== null;
  const mapped = new Set();
  const counts = { changed: 0, gone: 0, added: 0, unchanged: 0 };

  for (const { upstream } of manifest.files) {
    const upstreamPath = path.posix.join(base, upstream);

    if (mapped.has(upstreamPath)) continue;

    mapped.add(upstreamPath);

    const {
      status,
      detail,
      commits = [],
    } = fileStatus(git, commit, target, upstreamPath, ancestor);

    counts[status]++;
    lines.push(`  ${status.padEnd(9)}  ${upstream}${detail ? `  ${detail}` : ''}`);

    for (const entry of commits) lines.push(`             ${entry}`);
  }

  const added = git('diff', '--name-only', '--diff-filter=A', commit, target, '--', base) ?? '';

  for (const file of added.split('\n').filter((name) => name && !mapped.has(name))) {
    counts.added++;
    lines.push(`  ${'added'.padEnd(9)}  ${path.posix.relative(base, file)}`);
  }

  lines.push(
    `  ${Object.entries(counts)
      .map(([name, count]) => `${count} ${name}`)
      .join(', ')}`,
  );

  return lines;
}

export function report({
  root = ROOT,
  upstream = path.join(os.homedir(), 'code/payload'),
  to: target = defaultTarget(root),
  fetch = false,
} = {}) {
  if (!existsSync(path.join(upstream, '.git'))) {
    return { lines: [`- ${upstream} not found; skipped the vendored report.`], code: 0 };
  }

  const git = gitIn(upstream);
  const lines = [];

  if (fetch && git('fetch', 'origin', '--tags') === null) {
    lines.push(`⚠ git fetch origin --tags failed in ${upstream}; reporting from local refs.`);
  }

  const files = (gitIn(root)('ls-files', 'packages/**/VENDORED.md') ?? '')
    .split('\n')
    .filter(Boolean);

  const manifests = files.map((file) =>
    parseManifest(file, readFileSync(path.join(root, file), 'utf8'), (local) =>
      existsSync(path.join(root, local)),
    ),
  );

  for (const manifest of manifests) {
    const { Commit: commit, Path: base } = manifest.fields;

    if (manifest.problems.length > 0) continue;

    if (git('cat-file', '-e', `${commit}^{commit}`) === null) {
      manifest.problems.push(
        `${manifest.file}:${manifest.commitLine} Commit: ${commit} is not in ${upstream}`,
      );

      continue;
    }

    for (const { upstream: file, line } of manifest.files) {
      if (git('cat-file', '-e', `${commit}:${path.posix.join(base, file)}`) === null) {
        manifest.problems.push(`${manifest.file}:${line} ${file} is not in ${base} at Commit:`);
      }
    }
  }

  const problems = manifests.flatMap((manifest) => manifest.problems);
  const targetFound = git('rev-parse', '--verify', '--quiet', `${target}^{commit}`) !== null;

  if (!targetFound) {
    lines.push(
      `⚠ ${target} is not in ${upstream}; skipped the diffs (${FETCH_HINT} if it is new).`,
    );
  } else {
    for (const manifest of manifests) {
      if (manifest.problems.length === 0) lines.push(...reportManifest(git, manifest, target));
    }
  }

  const stale = staleness(git, manifests, target, targetFound);

  if (stale.length > 0) {
    lines.push(`⚠ ${upstream} may be out of date (${stale.join(', ')}); ${FETCH_HINT}.`);
  }

  lines.push(...problems.map((problem) => `✖ ${problem}`));

  return { lines, code: problems.length > 0 ? 1 : 0 };
}

function main() {
  const args = process.argv.slice(2);
  const options = {};

  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--fetch') options.fetch = true;
    else if (args[index] === '--to' && args[index + 1]) options.to = args[++index];
    else {
      console.error(USAGE);
      process.exit(1);
    }
  }

  const { lines, code } = report(options);

  console.log(lines.join('\n'));

  process.exitCode = code;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

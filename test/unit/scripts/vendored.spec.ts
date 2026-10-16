import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { parseManifest, report } from '../../../scripts/vendored.mjs';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const BASE = 'packages/sdk/src';

let dir = '';

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function write(root: string, file: string, content: string) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), content);
}

function commit(repo: string, message: string) {
  git(repo, 'add', '--all');
  git(repo, 'commit', '--quiet', '-m', message);

  return git(repo, 'rev-parse', 'HEAD');
}

function initRepo(repo: string) {
  mkdirSync(repo, { recursive: true });
  git(repo, 'init', '--quiet', '--initial-branch=main');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test');
}

function manifest(
  commit: string,
  { tag = 'v1.0.0', path: base = BASE, rows = ['a.ts', 'b.ts', 'c.ts'] } = {},
) {
  return [
    '# Vendored: test',
    '',
    '- Upstream: https://example.com/upstream',
    ...(base ? [`- Path: \`${base}\``] : []),
    `- Commit: \`${commit}\``,
    `- Tag: \`${tag}\``,
    '',
    '| Local | Upstream |',
    '| ----- | -------- |',
    ...rows.map((row) => `| \`${row}\` (\`note\`) | \`${row}\` (\`note\`) |`),
    '',
  ].join('\n');
}

function setup() {
  dir = mkdtempSync(path.join(os.tmpdir(), 'vendored-'));

  const origin = path.join(dir, 'origin');
  const upstream = path.join(dir, 'upstream');
  const root = path.join(dir, 'root');

  initRepo(origin);
  write(origin, `${BASE}/a.ts`, 'a\n');
  write(origin, `${BASE}/b.ts`, 'b\n');
  write(origin, `${BASE}/c.ts`, 'c\n');
  write(origin, `${BASE}/skipped/x.ts`, 'x\n');
  write(origin, 'other/outside.ts', 'o\n');

  const start = commit(origin, 'feat: start');

  git(origin, 'tag', 'v1.0.0');
  write(origin, `${BASE}/a.ts`, 'a2\n');
  write(origin, `${BASE}/skipped/x.ts`, 'x2\n');
  write(origin, `${BASE}/added.ts`, 'new\n');
  write(origin, 'other/new.ts', 'n\n');
  unlinkSync(path.join(origin, `${BASE}/b.ts`));

  const change = commit(origin, 'fix: change a, drop b');

  git(origin, 'tag', 'v1.1.0');
  git(dir, 'clone', '--quiet', origin, upstream);

  initRepo(root);

  write(
    root,
    'packages/frogbot/package.json',
    JSON.stringify({ dependencies: { payload: '1.1.0' } }),
  );

  write(root, 'packages/sdk/src/VENDORED.md', manifest(start));

  for (const file of ['a.ts', 'b.ts', 'c.ts']) write(root, `packages/sdk/src/${file}`, '');

  git(root, 'add', '--all');

  return { origin, upstream, root, start, change };
}

function track(root: string, file: string, content: string) {
  write(root, file, content);
  git(root, 'add', '--all');
}

describe('parseManifest', () => {
  it('reads the four fields and the first backtick span of each cell', () => {
    const parsed = parseManifest('packages/sdk/src/VENDORED.md', manifest('f'.repeat(40)));

    expect(parsed.fields).toEqual({
      Upstream: 'https://example.com/upstream',
      Path: BASE,
      Commit: 'f'.repeat(40),
      Tag: 'v1.0.0',
    });
    expect(parsed.files.map(({ local, upstream }) => [local, upstream])).toEqual([
      ['a.ts', 'a.ts'],
      ['b.ts', 'b.ts'],
      ['c.ts', 'c.ts'],
    ]);
    expect(parsed.problems).toEqual([]);
  });
});

describe('report', () => {
  it('lists changed, gone, added and unchanged files, leaving out files that were never ported', () => {
    const { upstream, root, change } = setup();
    const { lines, code } = report({ root, upstream });

    expect(code).toBe(0);
    expect(lines).toEqual([
      `packages/sdk/src ← ${BASE} ${git(upstream, 'rev-parse', 'v1.0.0').slice(0, 10)} → v1.1.0`,
      '  changed    a.ts  2 +-',
      `             ${change.slice(0, 7)} fix: change a, drop b`,
      `  gone       b.ts  deleted in ${change.slice(0, 7)} fix: change a, drop b`,
      '  unchanged  c.ts',
      '  added      added.ts',
      '  1 changed, 1 gone, 1 added, 1 unchanged',
    ]);
  });

  it('compares against --to and leaves refs unchanged without --fetch', () => {
    const { upstream, root, start } = setup();
    const before = git(upstream, 'for-each-ref');
    const { lines, code } = report({ root, upstream, to: start });

    expect(code).toBe(0);
    expect(lines.at(-1)).toBe('  0 changed, 0 gone, 0 added, 3 unchanged');
    expect(git(upstream, 'for-each-ref')).toBe(before);
  });

  it('names an unknown --to ref, suggests --fetch and exits 0', () => {
    const { upstream, root } = setup();
    const { lines, code } = report({ root, upstream, to: 'v9.9.9' });

    expect(code).toBe(0);
    expect(lines).toEqual([
      `⚠ v9.9.9 is not in ${upstream}; skipped the diffs (run \`pnpm vendored --fetch\` if it is new).`,
      `⚠ ${upstream} may be out of date (v9.9.9 missing); run \`pnpm vendored --fetch\`.`,
    ]);
  });

  it('warns once when a branch is behind its remote-tracking branch', () => {
    const { origin, upstream, root } = setup();

    write(origin, 'other/later.ts', 'l\n');
    commit(origin, 'feat: later');
    git(upstream, 'fetch', '--quiet');

    const { lines, code } = report({ root, upstream });

    expect(code).toBe(0);
    expect(lines.filter((line) => line.startsWith('⚠'))).toEqual([
      `⚠ ${upstream} may be out of date (main [behind 1]); run \`pnpm vendored --fetch\`.`,
    ]);
  });

  it('warns when a manifest tag is missing', () => {
    const { upstream, root, start } = setup();

    track(root, 'packages/sdk/src/VENDORED.md', manifest(start, { tag: 'v0.9.0' }));

    const { lines, code } = report({ root, upstream });

    expect(code).toBe(0);
    expect(lines.at(-1)).toBe(
      `⚠ ${upstream} may be out of date (tag v0.9.0 missing); run \`pnpm vendored --fetch\`.`,
    );
  });

  it('fetches tags from origin only with --fetch', () => {
    const { origin, upstream, root } = setup();

    git(origin, 'tag', 'v1.2.0');

    expect(report({ root, upstream, to: 'v1.2.0' }).lines[0]).toMatch(/^⚠ v1\.2\.0 is not in/);
    expect(report({ root, upstream, to: 'v1.2.0', fetch: true }).lines[0]).toMatch(/→ v1\.2\.0$/);
  });

  it('skips with exit 0 when the upstream repo is missing', () => {
    const { root } = setup();
    const missing = path.join(dir, 'nowhere');

    expect(report({ root, upstream: missing })).toEqual({
      lines: [`- ${missing} not found; skipped the vendored report.`],
      code: 0,
    });
  });

  it('exits 1 on a malformed manifest, naming the file and line', () => {
    const { upstream, root } = setup();

    track(root, 'packages/sdk/src/VENDORED.md', manifest('abc123', { path: '' }));

    const { lines, code } = report({ root, upstream });

    expect(code).toBe(1);
    expect(lines.filter((line) => line.startsWith('✖'))).toEqual([
      '✖ packages/sdk/src/VENDORED.md:1 missing `- Path:` field',
      '✖ packages/sdk/src/VENDORED.md:4 Commit: must be a full 40-character SHA',
    ]);
  });

  it('exits 1 when Commit: is not in the upstream repo', () => {
    const { upstream, root } = setup();

    track(root, 'packages/sdk/src/VENDORED.md', manifest('0'.repeat(40)));

    const { lines, code } = report({ root, upstream });

    expect(code).toBe(1);
    expect(lines.at(-1)).toBe(
      `✖ packages/sdk/src/VENDORED.md:5 Commit: ${'0'.repeat(40)} is not in ${upstream}`,
    );
  });

  it('exits 1 when a mapped upstream file is not under Path: at Commit:', () => {
    const { upstream, root, start } = setup();

    track(root, 'packages/sdk/src/typo.ts', '');
    track(root, 'packages/sdk/src/VENDORED.md', manifest(start, { rows: ['a.ts', 'typo.ts'] }));

    const { lines, code } = report({ root, upstream });

    expect(code).toBe(1);
    expect(lines.at(-1)).toBe(
      `✖ packages/sdk/src/VENDORED.md:11 typo.ts is not in ${BASE} at Commit:`,
    );
  });

  it('exits 1 when a mapped local file does not exist', () => {
    const { upstream, root, start } = setup();

    track(root, 'packages/sdk/src/VENDORED.md', manifest(start, { rows: ['a.ts', 'missing.ts'] }));

    const { lines, code } = report({ root, upstream });

    expect(code).toBe(1);
    expect(lines.at(-1)).toBe(
      '✖ packages/sdk/src/VENDORED.md:11 missing.ts is mapped but does not exist',
    );
  });
});

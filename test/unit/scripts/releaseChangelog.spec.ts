import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseArgs, releaseNotes } from '../../../scripts/release-changelog.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const scratchRoot = join(repo, 'test/.tmp');
const date = new Date('2026-10-27T23:30:00-07:00');
const COMMIT = 'https://github.com/frogbotai/frogbot/commit/';

let cwd: string;

function git(...args: string[]): string {
  const result = spawnSync(
    'git',
    [
      '-c',
      'commit.gpgsign=false',
      '-c',
      'tag.gpgsign=false',
      '-c',
      'core.hooksPath=/dev/null',
      ...args,
    ],
    { cwd, encoding: 'utf8' },
  );

  if (result.status !== 0) throw new Error(result.stderr);

  return result.stdout.trim();
}

const ADA = ['Ada Lovelace', 'ada@example.com'] as const;
const GRACE = ['Grace Hopper', 'grace@example.com'] as const;

function commit(message: string, [name, email]: readonly [string, string] = ADA): string {
  git(
    '-c',
    `user.name=${name}`,
    '-c',
    `user.email=${email}`,
    'commit',
    '--allow-empty',
    '-q',
    '-m',
    message,
  );

  return git('rev-parse', 'HEAD');
}

function link(hash: string): string {
  return `([${hash.slice(0, 7)}](${COMMIT}${hash}))`;
}

function notes(options: Record<string, unknown> = {}): string {
  return releaseNotes({ cwd, date, version: '1.1.0', login: () => undefined, ...options });
}

function headings(text: string): string[] {
  return text.split('\n').filter((line) => line.startsWith('#'));
}

beforeEach(() => {
  mkdirSync(scratchRoot, { recursive: true });
  cwd = realpathSync(mkdtempSync(join(scratchRoot, 'release-changelog-')));
  git('init', '-q', '-b', 'main');
  writeFileSync(join(cwd, 'package.json'), '{"version":"1.1.0"}\n');
  git('add', 'package.json');
  commit('chore: start');
  git('tag', 'v1.0.0');
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe('releaseNotes', () => {
  it('lists every section in order and leaves empty ones out', () => {
    const types = [
      'revert',
      'chore',
      'ci',
      'build',
      'test',
      'style',
      'docs',
      'refactor',
      'perf',
      'fix',
      'feat',
    ];

    for (const type of types) commit(`${type}: a ${type} change`);

    expect(headings(notes())).toEqual([
      '## [v1.1.0](https://github.com/frogbotai/frogbot/compare/v1.0.0...v1.1.0) (2026-10-28)',
      '### 🚀 Features',
      '### 🐛 Bug Fixes',
      '### ⚡ Performance',
      '### 🛠 Refactors',
      '### 📚 Documentation',
      '### 🎨 Styles',
      '### 🧪 Tests',
      '### 📦 Build',
      '### ⚙️ CI',
      '### 🏡 Chores',
      '### ⏪ Reverts',
      '### 🤝 Contributors',
    ]);
  });

  it('drops non-conventional subjects and both bump forms', () => {
    commit('Merge something');
    commit('wip: not a type');
    commit('chore: bump version to 1.1.0');
    commit('chore(release): v1.1.0');
    const fix = commit('fix: keep this');

    expect(notes()).toBe(
      [
        '## [v1.1.0](https://github.com/frogbotai/frogbot/compare/v1.0.0...v1.1.0) (2026-10-28)',
        '',
        '### 🐛 Bug Fixes',
        `* keep this ${link(fix)}`,
        '',
        '### 🤝 Contributors',
        '- Ada Lovelace',
        '',
      ].join('\n'),
    );
  });

  it('puts unscoped entries first, then sorts by scope, keeping log order for ties', () => {
    const uiOld = commit('feat(ui): older ui');
    const api = commit('feat(api): api change');
    const plain = commit('feat: plain change');
    const uiNew = commit('feat(ui): newer ui');

    const text = notes();

    expect(text).toContain(
      [
        '### 🚀 Features',
        `* plain change ${link(plain)}`,
        `* **api:** api change ${link(api)}`,
        `* **ui:** newer ui ${link(uiNew)}`,
        `* **ui:** older ui ${link(uiOld)}`,
      ].join('\n'),
    );
  });

  it('links a trailing (#n) as an issue before the hash', () => {
    const hash = commit('fix(jobs): handle retries (#164)');

    expect(notes()).toContain(
      `* **jobs:** handle retries ([#164](https://github.com/frogbotai/frogbot/issues/164)) ${link(hash)}`,
    );
  });

  it('lists breaking commits again with their footers, and no note for a bare !', () => {
    const bare = commit('feat(api)!: drop the old route');
    const multi = commit(
      [
        'fix(jobs): run one job per key',
        '',
        'Motivation that stays private (ticket 12).',
        '',
        'BREAKING CHANGE: `exclusive` is removed from',
        '`concurrency` types.',
        'Refs: 12',
      ].join('\n'),
    );

    const two = commit(
      [
        'refactor(ui): rename tokens',
        '',
        'Body.',
        '',
        'BREAKING CHANGE: first note.',
        'BREAKING-CHANGE: second note',
        'continues here.',
      ].join('\n'),
    );

    const text = notes();

    expect(text).toContain(`### 🛠 Refactors\n* **ui:** rename tokens ${link(two)}\n\n`);
    expect(text).toContain(
      [
        '### ⚠️ BREAKING CHANGES',
        `* **api:** drop the old route ${link(bare)}`,
        `* **jobs:** run one job per key ${link(multi)}`,
        '  `exclusive` is removed from',
        '  `concurrency` types.',
        `* **ui:** rename tokens ${link(two)}`,
        '  first note.',
        '  second note',
        '  continues here.',
        '',
      ].join('\n'),
    );
    expect(text).not.toContain('Motivation');
    expect(text).not.toContain('Refs');
  });

  it('defaults from to the newest earlier tag, skipping a tag on to itself', () => {
    commit('feat: in 1.0.1');
    git('tag', 'v1.0.1');
    const feat = commit('feat: in 1.1.0');
    git('tag', 'v1.1.0');

    const text = notes({ version: undefined, to: 'v1.1.0' });

    expect(text.split('\n')[0]).toBe(
      '## [v1.1.0](https://github.com/frogbotai/frogbot/compare/v1.0.1...v1.1.0) (2026-10-28)',
    );
    expect(text).toContain(`* in 1.1.0 ${link(feat)}`);
    expect(text).not.toContain('in 1.0.1');
  });

  it('reads the version from the working tree for HEAD and from the commit for another ref', () => {
    commit('feat: first');
    writeFileSync(join(cwd, 'package.json'), '{"version":"2.0.0"}\n');

    expect(notes({ version: undefined }).split('\n')[0]).toContain('compare/v1.0.0...v2.0.0');
    expect(notes({ version: undefined, to: 'HEAD~0' }).split('\n')[0]).toContain('...v1.1.0');
  });

  it('lists every commit under a plain heading when there is no earlier tag', () => {
    git('tag', '-d', 'v1.0.0');
    commit('fix: second');

    const text = notes();

    expect(text.split('\n')[0]).toBe('## v1.1.0 (2026-10-28)');
    expect(text).toContain('### 🐛 Bug Fixes\n* second');
    expect(text).toContain('### 🏡 Chores\n* start');
  });

  it('honors an explicit from', () => {
    commit('feat: newer');

    expect(notes({ from: 'HEAD~1' })).toContain('compare/HEAD~1...v1.1.0');
  });

  it('lists each author once with their login, or the name alone without one', () => {
    commit('feat: from ada');
    const grace = commit('fix: from grace', GRACE);
    commit('fix: again from ada');
    commit('chore: bump version to 1.1.0', ['Bot', 'bot@example.com']);

    const asked: string[] = [];
    const text = notes({
      login: (hash: string) => {
        asked.push(hash);

        return hash === grace ? undefined : 'ada';
      },
    });

    expect(text.endsWith('### 🤝 Contributors\n- Ada Lovelace (@ada)\n- Grace Hopper\n')).toBe(
      true,
    );
    expect(asked).toHaveLength(2);
  });
});

describe('parseArgs', () => {
  it('reads the flags and refuses anything else', () => {
    expect(parseArgs(['--', '--from', 'v1.0.0', '--to', 'v1.1.0', '--version', '1.1.0'])).toEqual({
      from: 'v1.0.0',
      to: 'v1.1.0',
      version: '1.1.0',
    });
    expect(parseArgs(['--draft'])).toHaveProperty('error');
    expect(parseArgs(['--from'])).toHaveProperty('error');
  });
});

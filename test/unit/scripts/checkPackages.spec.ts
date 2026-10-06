import { describe, expect, it } from 'vitest';

import { checkPackages, workspacePatterns } from '../../../scripts/check-packages.mjs';

const WORKSPACE = `packages:
  - 'packages/*'
  - 'packages/pieces/*'
  - 'packages/plugins/*'
  - 'test'
  - "templates/blank"
  - test/e2e/fixtures/tool-agent

onlyBuiltDependencies:
  - esbuild
`;

type Tree = Record<string, string[]>;

function check(patterns: string[], tree: Tree, tracked: string[]) {
  return checkPackages({
    patterns,
    listDirs: (dir: string) => tree[dir] ?? [],
    tracked: new Set(tracked),
  });
}

const TREE: Tree = {
  packages: ['frogbot', 'pieces', 'plugins', 'node_modules', '.cache'],
  'packages/pieces': ['piece-http'],
  'packages/plugins': ['plugin-roles'],
};

const TRACKED = [
  'packages/frogbot/package.json',
  'packages/pieces/piece-http/package.json',
  'packages/plugins/plugin-roles/package.json',
  'test/package.json',
];

const PATTERNS = ['packages/*', 'packages/pieces/*', 'packages/plugins/*', 'test'];

describe('check packages', () => {
  it('reads the packages list from pnpm-workspace.yaml', () => {
    expect(workspacePatterns(WORKSPACE)).toEqual([
      'packages/*',
      'packages/pieces/*',
      'packages/plugins/*',
      'test',
      'templates/blank',
      'test/e2e/fixtures/tool-agent',
    ]);
  });

  it('passes when every matched folder has a tracked package.json', () => {
    expect(check(PATTERNS, TREE, TRACKED)).toEqual([]);
  });

  it('rejects plugin-oauth left with only dist/ after 00b86c61 untracked its package.json', () => {
    const tree = { ...TREE, 'packages/plugins': ['plugin-oauth', 'plugin-roles'] };

    expect(check(PATTERNS, tree, TRACKED)).toEqual([
      { folder: 'packages/plugins/plugin-oauth', reason: 'no tracked package.json' },
    ]);
  });

  it('rejects frogbot-eslint-config left with only node_modules/ after 3feca771', () => {
    const tree = { ...TREE, packages: [...TREE.packages, 'frogbot-eslint-config'] };

    expect(check(PATTERNS, tree, TRACKED)).toEqual([
      { folder: 'packages/frogbot-eslint-config', reason: 'no tracked package.json' },
    ]);
  });

  it('rejects a literal workspace folder without a tracked package.json', () => {
    expect(check([...PATTERNS, 'templates/blank'], TREE, TRACKED)).toEqual([
      { folder: 'templates/blank', reason: 'no tracked package.json' },
    ]);
  });

  it('checks a literal folder that also groups other globs', () => {
    expect(check([...PATTERNS, 'test/e2e/fixtures/x'], TREE, TRACKED.slice(0, 3))).toEqual([
      { folder: 'test', reason: 'no tracked package.json' },
      { folder: 'test/e2e/fixtures/x', reason: 'no tracked package.json' },
    ]);
  });

  it('skips folders excluded with a negated glob', () => {
    const tree = { ...TREE, 'packages/plugins': ['plugin-oauth', 'plugin-roles'] };

    expect(check([...PATTERNS, '!packages/plugins/plugin-oauth'], tree, TRACKED)).toEqual([]);
  });

  it('fails on globs it cannot expand', () => {
    expect(check(['packages/**'], TREE, TRACKED)).toEqual([
      { folder: 'packages/**', reason: 'unsupported workspace glob' },
    ]);
  });
});

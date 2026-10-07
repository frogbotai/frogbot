import { describe, expect, it } from 'vitest';

import {
  findPatchedDependencyViolation,
  findPathViolations,
  formatViolation,
} from '../../../scripts/precommit-guard.mjs';

function manifest(patchedDependencies?: Record<string, string>) {
  return JSON.stringify({
    name: 'frogbot-monorepo',
    pnpm: { overrides: { zod: '^4.3.6' }, ...(patchedDependencies && { patchedDependencies }) },
  });
}

describe('findPathViolations', () => {
  it.each([
    ['.idea/t.md', '.idea/ is private; unstage it'],
    ['.idea/_process/tickets/ticket215/issue.md', '.idea/ is private; unstage it'],
    ['CHANGELOG.md', 'changelogs are not committed; unstage it'],
    ['packages/frogbot/CHANGELOG.md', 'changelogs are not committed; unstage it'],
    ['.changeset/a.md', 'changesets are not used; unstage it'],
    ['patches/a.patch', 'dependency patches need owner approval; unstage it'],
    ['packages/ui/patches/zod.patch', 'dependency patches need owner approval; unstage it'],
  ])('refuses %s', (file, reason) => {
    expect(findPathViolations([file])).toEqual([{ path: file, reason }]);
  });

  it.each([
    'src/index.ts',
    'docs/changelog-ideas.md',
    'src/patches.ts',
    'notes.idea/x.md',
    'packages/ui/.idea-config.json',
    'docs/.changeset.md',
  ])('accepts %s', (file) => {
    expect(findPathViolations([file])).toEqual([]);
  });

  it('reports each offending path once, in staged order', () => {
    const violations = findPathViolations(['.idea/a.md', 'src/a.ts', 'CHANGELOG.md']);

    expect(violations.map(({ path }) => path)).toEqual(['.idea/a.md', 'CHANGELOG.md']);
  });
});

describe('findPatchedDependencyViolation', () => {
  it('refuses a patchedDependencies key that HEAD does not have', () => {
    const violation = findPatchedDependencyViolation({
      path: 'package.json',
      staged: manifest({ 'zod@4.3.6': 'patches/zod.patch' }),
      head: manifest(),
    });

    expect(violation).toEqual({
      path: 'package.json',
      reason: 'adds patchedDependencies "zod@4.3.6"; dependency patches need owner approval',
    });
  });

  it('names only the keys that are new', () => {
    const violation = findPatchedDependencyViolation({
      path: 'package.json',
      staged: manifest({ 'zod@4.3.6': 'patches/zod.patch', 'ai@7.0.116': 'patches/ai.patch' }),
      head: manifest({ 'zod@4.3.6': 'patches/zod.patch' }),
    });

    expect(violation?.reason).toBe(
      'adds patchedDependencies "ai@7.0.116"; dependency patches need owner approval',
    );
  });

  it('refuses patchedDependencies in a package.json that is new', () => {
    const violation = findPatchedDependencyViolation({
      path: 'package.json',
      staged: manifest({ 'zod@4.3.6': 'patches/zod.patch' }),
      head: null,
    });

    expect(violation?.path).toBe('package.json');
  });

  it.each([
    ['unchanged', manifest({ 'zod@4.3.6': 'patches/zod.patch' })],
    ['removed', manifest()],
  ])('accepts patchedDependencies that are %s', (_label, staged) => {
    const violation = findPatchedDependencyViolation({
      path: 'package.json',
      staged,
      head: manifest({ 'zod@4.3.6': 'patches/zod.patch' }),
    });

    expect(violation).toBeNull();
  });

  it('accepts a package.json without patchedDependencies', () => {
    const violation = findPatchedDependencyViolation({
      path: 'package.json',
      staged: manifest(),
      head: manifest(),
    });

    expect(violation).toBeNull();
  });

  it('ignores a staged package.json that is not valid JSON', () => {
    const violation = findPatchedDependencyViolation({
      path: 'package.json',
      staged: '{ "pnpm": ',
      head: manifest(),
    });

    expect(violation).toBeNull();
  });

  it('refuses a new key in a pnpm-workspace.yaml block mapping', () => {
    const violation = findPatchedDependencyViolation({
      path: 'pnpm-workspace.yaml',
      staged: [
        'packages:',
        "  - 'packages/*'",
        'patchedDependencies:',
        '  zod@4.3.6: patches/zod.patch',
        "  '@ai-sdk/openai@4.0.78': patches/openai.patch",
        'onlyBuiltDependencies:',
        '  - sharp',
      ].join('\n'),
      head: [
        'packages:',
        "  - 'packages/*'",
        'patchedDependencies:',
        '  zod@4.3.6: patches/zod.patch',
      ].join('\n'),
    });

    expect(violation?.reason).toBe(
      'adds patchedDependencies "@ai-sdk/openai@4.0.78"; dependency patches need owner approval',
    );
  });

  it('refuses a new key in a pnpm-workspace.yaml flow mapping', () => {
    const violation = findPatchedDependencyViolation({
      path: 'pnpm-workspace.yaml',
      staged:
        "packages:\n  - 'packages/*'\npatchedDependencies: { zod@4.3.6: patches/zod.patch }\n",
      head: "packages:\n  - 'packages/*'\n",
    });

    expect(violation?.reason).toBe(
      'adds patchedDependencies "zod@4.3.6"; dependency patches need owner approval',
    );
  });

  it('accepts a pnpm-workspace.yaml without patchedDependencies', () => {
    const violation = findPatchedDependencyViolation({
      path: 'pnpm-workspace.yaml',
      staged: "packages:\n  - 'packages/*'\n  - 'templates/*'\n",
      head: "packages:\n  - 'packages/*'\n",
    });

    expect(violation).toBeNull();
  });
});

describe('formatViolation', () => {
  it('prints the path and the rule on one line', () => {
    const line = formatViolation({
      path: '.idea/_process/tickets/x.md',
      reason: '.idea/ is private; unstage it',
    });

    expect(line).toBe(
      'precommit-guard: .idea/_process/tickets/x.md — .idea/ is private; unstage it',
    );
  });
});

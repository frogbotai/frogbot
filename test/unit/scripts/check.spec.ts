import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildFilters,
  capLines,
  changedPackages,
  discoverChecks,
  eslintLines,
  labelLines,
  MAX_LINES,
  parseArgs,
  prettierLines,
  report,
  stalePackages,
  tscLines,
} from '../../../scripts/check.mjs';

type Package = { name: string; dir: string; typecheck: boolean };

const root = '/repo';

describe('parseArgs', () => {
  it('runs everything with no arguments', () => {
    expect(parseArgs([])).toEqual({ full: false });
  });

  it('runs everything with the full typecheck with --full', () => {
    expect(parseArgs(['--full'])).toEqual({ full: true });
  });

  it('runs one check and passes every later argument through', () => {
    expect(parseArgs(['generated', '--write', 'x'])).toEqual({
      name: 'generated',
      args: ['--write', 'x'],
    });
  });

  it('drops a leading -- separator', () => {
    expect(parseArgs(['--', 'branding'])).toEqual({ name: 'branding', args: [] });
    expect(parseArgs(['--', '--full'])).toEqual({ full: true });
  });

  it('rejects unknown flags and a name after a flag', () => {
    expect(parseArgs(['--fix'])).toEqual({ error: 'unknown argument "--fix"' });
    expect(parseArgs(['--full', 'branding'])).toEqual({ error: 'unknown argument "branding"' });
  });
});

describe('discoverChecks', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'check-runner-'));
  });

  afterEach(() => {
    rmSync(dir, { force: true, recursive: true });
  });

  it('names each scripts/check-*.mjs file by the part after check-, sorted', () => {
    for (const file of [
      'check-zeta.mjs',
      'check-docs-links.mjs',
      'check.mjs',
      'check-a.js',
      'b.mjs',
    ]) {
      writeFileSync(join(dir, file), '');
    }

    expect(discoverChecks(dir)).toEqual(['docs-links', 'zeta']);
  });

  it('finds the checks the release scripts call', () => {
    expect(discoverChecks()).toEqual(
      expect.arrayContaining(['dist-imports', 'single-frogbot', 'ui-architecture']),
    );
  });
});

describe('changedPackages', () => {
  const packages: Package[] = [
    { name: 'frogbot-monorepo', dir: '', typecheck: true },
    { name: 'frogbot', dir: 'packages/frogbot', typecheck: true },
    { name: '@frogbotai/ui', dir: 'packages/ui', typecheck: true },
    { name: 'frogbot-test-suite', dir: 'test', typecheck: false },
    { name: 'frogbot-e2e-tool-agent', dir: 'test/e2e/fixtures/tool-agent', typecheck: true },
  ];

  const names = (files: string[]) =>
    (changedPackages({ files, packages }) as Package[]).map(({ name }) => name);

  it('maps each file to the package that contains it, once, sorted by name', () => {
    expect(
      names(['packages/ui/src/a.tsx', 'packages/frogbot/src/b.ts', 'packages/ui/src/c.tsx']),
    ).toEqual(['@frogbotai/ui', 'frogbot']);
  });

  it('prefers the deepest package for nested workspaces', () => {
    expect(names(['test/e2e/fixtures/tool-agent/src/agent.ts'])).toEqual([
      'frogbot-e2e-tool-agent',
    ]);
  });

  it('skips the workspace root and packages without a typecheck script', () => {
    expect(names(['scripts/check.mjs', 'test/unit/a.spec.ts', 'README.md'])).toEqual([]);
  });

  it('does not match a package by a shared name prefix', () => {
    expect(names(['packages/ui-extra/a.ts'])).toEqual([]);
  });
});

describe('stalePackages', () => {
  const names = (packages: { name: string; dist: boolean; built?: number; newest: number }[]) =>
    (stalePackages(packages) as { name: string }[]).map(({ name }) => name);

  it('keeps a package whose sources are no newer than its last build', () => {
    expect(names([{ name: 'a', dist: true, built: 200, newest: 100 }])).toEqual([]);
    expect(names([{ name: 'a', dist: true, built: 200, newest: 200 }])).toEqual([]);
  });

  it('rebuilds a package with a source newer than its last build', () => {
    expect(names([{ name: 'a', dist: true, built: 200, newest: 201 }])).toEqual(['a']);
  });

  it('rebuilds a package without dist or without a finished build', () => {
    expect(
      names([
        { name: 'no-dist', dist: false, built: 200, newest: 100 },
        { name: 'no-stamp', dist: true, built: undefined, newest: 100 },
        { name: 'fresh', dist: true, built: 200, newest: 100 },
      ]),
    ).toEqual(['no-dist', 'no-stamp']);
  });
});

describe('buildFilters', () => {
  const named = (...list: string[]) => list.map((name) => ({ name }));

  it('builds stale packages alone and changed packages with their dependencies', () => {
    expect(buildFilters({ stale: named('b', 'a'), changed: named('frogbot') })).toEqual([
      '--filter',
      'a',
      '--filter',
      'b',
      '--filter',
      'frogbot...',
    ]);
  });

  it('names a package that is both stale and changed once, with its dependencies', () => {
    expect(buildFilters({ stale: named('frogbot'), changed: named('frogbot') })).toEqual([
      '--filter',
      'frogbot...',
    ]);
  });
});

describe('eslintLines', () => {
  it('prints every message as path:line rule message, relative to the root', () => {
    const json = JSON.stringify([
      {
        filePath: '/repo/packages/frogbot/src/a.ts',
        messages: [
          { line: 3, ruleId: 'prefer-const', message: "'x' is never reassigned." },
          { line: 4, ruleId: '@typescript-eslint/no-unused-vars', message: "'y' is unused." },
        ],
      },
      {
        filePath: '/repo/scripts/b.mjs',
        messages: [{ line: 1, ruleId: null, message: 'Parsing error: Unexpected token\nmore' }],
      },
    ]);

    expect(eslintLines(json, { root })).toEqual([
      "packages/frogbot/src/a.ts:3 prefer-const 'x' is never reassigned.",
      "packages/frogbot/src/a.ts:4 @typescript-eslint/no-unused-vars 'y' is unused.",
      'scripts/b.mjs:1 eslint Parsing error: Unexpected token',
    ]);
  });

  it('prints nothing for a clean run', () => {
    expect(eslintLines('[]', { root })).toEqual([]);
  });
});

describe('tscLines', () => {
  it('resolves plain tsc paths against the package directory', () => {
    const output = [
      '> frogbot@0.30.0 typecheck /repo/packages/frogbot',
      "src/a.ts(70,14): error TS2322: Type 'string' is not assignable to type 'number'.",
      '../../test/types/ai/config.test-d.ts(9,1): error TS2578: Unused directive.',
      '  Continuation line of the previous error.',
    ].join('\n');

    expect(tscLines(output, { root, cwd: '/repo/packages/frogbot' })).toEqual([
      "packages/frogbot/src/a.ts:70 TS2322 Type 'string' is not assignable to type 'number'.",
      'test/types/ai/config.test-d.ts:9 TS2578 Unused directive.',
    ]);
  });

  it("resolves pnpm's recursive prefix against the package it names", () => {
    const output = [
      'packages/ui typecheck: src/b.tsx(2,5): error TS2304: Cannot find name ‘x’.',
      'packages/frogbot build: src/c.ts(1,1): error TS1005: Expected ;.',
      'packages/sdk typecheck: error TS5083: Cannot read file tsconfig.json.',
    ].join('\n');

    expect(tscLines(output, { root })).toEqual([
      'packages/ui/src/b.tsx:2 TS2304 Cannot find name ‘x’.',
      'packages/frogbot/src/c.ts:1 TS1005 Expected ;.',
      'packages/sdk TS5083 Cannot read file tsconfig.json.',
    ]);
  });
});

describe('prettierLines', () => {
  it('lists unformatted files and parse errors, without the closing hint', () => {
    const output = [
      'Checking formatting...',
      '[warn] scripts/check.mjs',
      '[warn] Code style issues found in 2 files. Run Prettier with --write to fix.',
      '[error] docs/a.json: SyntaxError: Unexpected token (1:5)',
      '[error] > 1 | {,}',
    ].join('\n');

    expect(prettierLines(output)).toEqual([
      'scripts/check.mjs prettier unformatted',
      'docs/a.json prettier SyntaxError: Unexpected token (1:5)',
    ]);
  });
});

describe('labelLines', () => {
  it("prefixes each output line with the label and drops pnpm's banner", () => {
    expect(labelLines('branding', '> pnpm banner\nx.ts:1 Payload\n\n', 1)).toEqual([
      'branding: x.ts:1 Payload',
    ]);
  });

  it('reports the exit code when there is no output', () => {
    expect(labelLines('branding', '', 1)).toEqual(['branding: exited with code 1']);
  });
});

describe('capLines', () => {
  const lines = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => `${prefix}${index}`);

  it('keeps everything under the cap, deduplicated across groups', () => {
    expect(capLines([['a', 'b'], ['b', 'c'], []])).toEqual({ lines: ['a', 'b', 'c'], cut: 0 });
  });

  it('shares the cap between groups so a noisy one cannot hide the rest', () => {
    const { lines: kept, cut } = capLines([lines('eslint', 100), lines('tsc', 2), lines('x', 5)]);

    expect(kept).toHaveLength(MAX_LINES);
    expect(kept).toEqual(expect.arrayContaining(['tsc0', 'tsc1', 'x4']));
    expect(kept.filter((line) => line.startsWith('eslint'))).toHaveLength(MAX_LINES - 7);
    expect(cut).toBe(107 - MAX_LINES);
  });
});

describe('report', () => {
  it('prints only the summary when everything passes', () => {
    expect(report({ ok: true, groups: [[], []], summary: 'check: OK', log: 'l.log' })).toEqual([
      'check: OK',
    ]);
  });

  it('prints the kept lines, the cut count, and the log path on failure', () => {
    const groups = [Array.from({ length: MAX_LINES + 3 }, (_, index) => `f.ts:${index} r m`)];
    const output = report({ ok: false, groups, summary: 'check: OK', log: '.idea/tmp/c.log' });

    expect(output).toHaveLength(MAX_LINES + 2);
    expect(output.slice(-2)).toEqual(['… 3 more', 'full log: .idea/tmp/c.log']);
  });
});

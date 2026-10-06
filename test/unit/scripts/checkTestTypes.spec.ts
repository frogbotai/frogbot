import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import { fullOnlyChecks } from '../../../scripts/check.mjs';
import {
  baselineTotal,
  compareBaseline,
  countErrors,
  discoverPrograms,
  layoutProblems,
  lowerBaseline,
  mergeErrors,
  parseTsc,
  poolSize,
  reportLines,
  stableConfig,
  WRITE_LINE,
} from '../../../scripts/check-test-types.mjs';

const output = [
  "test/a.spec.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.",
  "test/a.spec.ts(9,1): error TS2322: Type 'string' is not assignable to type 'number'.",
  "test/b.spec.ts(1,23): error TS2307: Cannot find module 'missing' or its corresponding type declarations.",
  "test/c.spec.ts(4,5): error TS2345: Argument of type '{ a: number; }' is not assignable to parameter of type 'Options'.",
  "  Object literal may only specify known properties, and 'a' does not exist in type 'Options'.",
].join('\n');

describe('check test-types', () => {
  it('runs only in pnpm check --full', () => {
    expect(fullOnlyChecks()).toContain('test-types');
  });

  it('counts tsc errors per file and code, skipping continuation lines', () => {
    const { errors, global } = parseTsc(output);

    expect(global).toEqual([]);
    expect(errors[0]).toEqual({
      file: 'test/a.spec.ts',
      line: 3,
      column: 7,
      code: 'TS2322',
      message: "Type 'string' is not assignable to type 'number'.",
    });
    expect(countErrors(errors)).toEqual({
      'test/a.spec.ts': { TS2322: 2 },
      'test/b.spec.ts': { TS2307: 1 },
      'test/c.spec.ts': { TS2345: 1 },
    });
  });

  it('keeps config errors out of the counts, labelled with their program', () => {
    expect(parseTsc("error TS5101: Option 'baseUrl' is deprecated.")).toEqual({
      errors: [],
      global: ["test/tsconfig.json TS5101 Option 'baseUrl' is deprecated."],
    });
    expect(
      parseTsc("error TS5101: Option 'baseUrl' is deprecated.", 'test/chat/tsconfig.json'),
    ).toEqual({
      errors: [],
      global: ["test/chat/tsconfig.json TS5101 Option 'baseUrl' is deprecated."],
    });
  });

  it('counts an error that several programs report once', () => {
    const shared = 'test/__helpers/boot.ts(4,2): error TS2740: Type is missing';

    const errors = mergeErrors([
      parseTsc(`${shared} 43 more.`).errors,
      parseTsc(`${shared} 45 more.\ntest/__helpers/boot.ts(4,2): error TS2322: Other.`).errors,
      parseTsc(`${shared} 43 more.\ntest/__helpers/boot.ts(9,2): error TS2740: Again.`).errors,
    ]);

    expect(countErrors(errors)).toEqual({ 'test/__helpers/boot.ts': { TS2322: 1, TS2740: 2 } });
  });

  it('requires each program to exclude exactly the programs nearest inside it', () => {
    const programs = [
      { config: 'test/tsconfig.json', exclude: ['node_modules', 'types', 'chat', 'gone'] },
      { config: 'test/chat/tsconfig.json', exclude: [] },
      { config: 'test/unit/tsconfig.json', exclude: ['frogbot'] },
      { config: 'test/unit/frogbot/tsconfig.json', exclude: [] },
      { config: 'test/unit/roles/tsconfig.json', exclude: [] },
    ];

    expect(layoutProblems({ programs, augmented: [] })).toEqual([
      'test/tsconfig.json compiles test/unit again; add "unit" to its exclude',
      'test/tsconfig.json compiles test/e2e/fixtures/sdk-frontend again; add "e2e/fixtures/sdk-frontend" to its exclude',
      'test/tsconfig.json excludes "gone", which has no tsconfig.json',
      'test/unit/tsconfig.json compiles test/unit/roles again; add "roles" to its exclude',
    ]);
  });

  it('requires every frogbot augmentation to have a program of its own', () => {
    const programs = [
      { config: 'test/tsconfig.json', exclude: ['types', 'e2e/fixtures/sdk-frontend', 'chat'] },
      { config: 'test/chat/tsconfig.json', exclude: [] },
    ];

    expect(
      layoutProblems({
        programs,
        augmented: ['test/chat/frogbot-types.ts', 'test/jobs/frogbot-types.ts'],
      }),
    ).toEqual([
      'test/jobs/frogbot-types.ts augments frogbot for all of test/tsconfig.json; give its folder a tsconfig.json',
    ]);
  });

  it('finds every program, largest first, and every frogbot augmentation', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'check-test-types-'));
    const files = {
      'test/tsconfig.json': '{}',
      'test/a.spec.ts': '',
      'test/chat/tsconfig.json': '{}',
      'test/chat/frogbot-types.ts': "declare module 'frogbot' {}",
      'test/chat/a.spec.ts': 'expect(output).toContain("declare module \'frogbot\'");',
      'test/chat/b.spec.ts': '',
      'test/types/tsconfig.json': '{}',
      'test/chat/node_modules/x/tsconfig.json': '{}',
      'test/browser/fixtures/app/.next/tsconfig.json': '{}',
    };

    onTestFinished(() => rmSync(root, { recursive: true, force: true }));

    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), content);
    }

    expect(discoverPrograms(root)).toEqual({
      programs: ['test/chat/tsconfig.json', 'test/tsconfig.json'],
      augmented: ['test/chat/frogbot-types.ts'],
    });
  });

  it('checks a Next fixture without its build output', () => {
    const next = {
      compilerOptions: { incremental: true },
      include: ['next-env.d.ts', '**/*.ts', '.next/types/**/*.ts'],
      exclude: ['node_modules'],
    };

    expect(
      stableConfig(next, { dir: '/repo/test/app', buildInfo: '/tmp/app.tsbuildinfo' }),
    ).toEqual({
      extends: '/repo/test/app/tsconfig.json',
      compilerOptions: { tsBuildInfoFile: '/tmp/app.tsbuildinfo' },
      include: ['/repo/test/app/next-env.d.ts', '/repo/test/app/**/*.ts'],
    });
    expect(
      stableConfig({ include: ['./**/*.ts'] }, { dir: '/repo/test/chat', buildInfo: '' }),
    ).toBeUndefined();
  });

  it('sizes the pool to memory and cores', () => {
    expect(poolSize({ cores: 14, memoryMB: 49_152 })).toBe(6);
    expect(poolSize({ cores: 4, memoryMB: 131_072 })).toBe(4);
    expect(poolSize({ cores: 8, memoryMB: 4_096 })).toBe(1);
  });

  it('passes when the errors match the baseline exactly', () => {
    const counts = countErrors(parseTsc(output).errors);

    expect(compareBaseline({ counts, baseline: counts })).toEqual({ over: [], dropped: [] });
  });

  it('fails on a new error and prints every error of that file and code', () => {
    const { errors } = parseTsc(output);
    const counts = countErrors(errors);
    const result = compareBaseline({
      counts,
      baseline: { 'test/a.spec.ts': { TS2322: 1 }, 'test/c.spec.ts': { TS2345: 1 } },
    });

    expect(result).toEqual({
      over: [
        { file: 'test/a.spec.ts', code: 'TS2322', count: 2, baseline: 1 },
        { file: 'test/b.spec.ts', code: 'TS2307', count: 1, baseline: 0 },
      ],
      dropped: [],
    });
    expect(reportLines({ errors, ...result })).toEqual([
      'test/a.spec.ts TS2322 2 errors, baseline 1',
      "test/a.spec.ts:3 TS2322 Type 'string' is not assignable to type 'number'.",
      "test/a.spec.ts:9 TS2322 Type 'string' is not assignable to type 'number'.",
      'test/b.spec.ts TS2307 1 errors, baseline 0',
      "test/b.spec.ts:1 TS2307 Cannot find module 'missing' or its corresponding type declarations.",
    ]);
  });

  it('fails on a fixed error until the baseline is lowered', () => {
    const { errors } = parseTsc(output);
    const counts = countErrors(errors);
    const baseline = {
      'test/a.spec.ts': { TS2322: 3 },
      'test/b.spec.ts': { TS2307: 1 },
      'test/c.spec.ts': { TS2345: 1 },
      'test/gone.spec.ts': { TS2339: 2 },
    };
    const result = compareBaseline({ counts, baseline });

    expect(result.over).toEqual([]);
    expect(reportLines({ errors, ...result })).toEqual([
      'test/a.spec.ts TS2322 2 errors, baseline 3',
      'test/gone.spec.ts TS2339 0 errors, baseline 2',
      WRITE_LINE,
    ]);

    const lowered = lowerBaseline({ counts, baseline });

    expect(lowered).toEqual(counts);
    expect(baselineTotal(lowered)).toBe(4);
    expect(compareBaseline({ counts, baseline: lowered })).toEqual({ over: [], dropped: [] });
  });

  it('never raises a count when lowering', () => {
    expect(
      lowerBaseline({
        counts: { 'test/a.spec.ts': { TS2322: 5 }, 'test/new.spec.ts': { TS2307: 1 } },
        baseline: { 'test/a.spec.ts': { TS2322: 2 } },
      }),
    ).toEqual({ 'test/a.spec.ts': { TS2322: 2 } });
  });
});

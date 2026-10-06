import { describe, expect, it } from 'vitest';

import { fullOnlyChecks } from '../../../scripts/check.mjs';
import {
  baselineTotal,
  compareBaseline,
  countErrors,
  lowerBaseline,
  parseTsc,
  reportLines,
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
      code: 'TS2322',
      message: "Type 'string' is not assignable to type 'number'.",
    });
    expect(countErrors(errors)).toEqual({
      'test/a.spec.ts': { TS2322: 2 },
      'test/b.spec.ts': { TS2307: 1 },
      'test/c.spec.ts': { TS2345: 1 },
    });
  });

  it('keeps config errors out of the counts', () => {
    expect(parseTsc("error TS5101: Option 'baseUrl' is deprecated.")).toEqual({
      errors: [],
      global: ["test/tsconfig.json TS5101 Option 'baseUrl' is deprecated."],
    });
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

import { describe, expect, it } from 'vitest';

import { reportKept } from '../../../../../packages/frogbot/src/bin/service/schema.js';

describe('kept schema line', () => {
  it('writes the line once while the kept set stays the same, and again when it changes', () => {
    const written: string[] = [];
    const write = (line: string) => written.push(line);
    const one = 'Schema sync kept 1 removed column with their data, hidden: deals.company.';
    const two =
      'Schema sync kept 2 removed columns with their data, hidden: deals.company, deals.stage.';

    let last = reportKept([one], undefined, write);
    last = reportKept([one], last, write);
    last = reportKept([two], last, write);
    last = reportKept([], last, write);
    reportKept([two], last, write);

    expect(written).toEqual([one, two, two]);
  });
});

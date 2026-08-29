import { describe, expect, it } from 'vitest';

import { parseExportTrainingDataArgs } from '../../../../packages/frogbot/src/bin/exportTrainingData.js';

describe('parseExportTrainingDataArgs', () => {
  it('parses space- and equals-separated options', () => {
    expect(
      parseExportTrainingDataArgs([
        '--where',
        '{"agent":{"equals":"support"}}',
        '--output=out.jsonl',
        '--page-size',
        '25',
      ]),
    ).toEqual({
      where: { agent: { equals: 'support' } },
      output: 'out.jsonl',
      pageSize: 25,
    });
  });

  it('defaults to no options', () => {
    expect(parseExportTrainingDataArgs([])).toEqual({});
  });

  it.each([
    [['--where', '{oops'], '--where must be valid JSON'],
    [['--page-size', 'x'], '--page-size must be a positive integer'],
    [['--page-size', '0'], '--page-size must be a positive integer'],
    [['--nope', '1'], 'unknown option --nope'],
    [['--output'], 'missing value for --output'],
  ])('rejects %j', (args, message) => {
    expect(() => parseExportTrainingDataArgs(args)).toThrow(message);
  });
});

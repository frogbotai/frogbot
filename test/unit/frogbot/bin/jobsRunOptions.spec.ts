import { describe, expect, it } from 'vitest';

import {
  jobsRunUsage,
  parseJobsRunOptions,
} from '../../../../packages/frogbot/src/bin/jobsRunOptions.js';

describe('jobs:run options', () => {
  it('defaults to ten jobs from the default queue every minute without scheduling', () => {
    expect(parseJobsRunOptions([])).toEqual({
      cron: '* * * * *',
      limit: 10,
      queue: 'default',
      allQueues: false,
      handleSchedules: false,
      help: false,
    });

    expect(jobsRunUsage).toContain('every minute');
    expect(jobsRunUsage).toContain('default: 10; 0 runs no jobs');
  });

  it('parses separate and equals values and scheduler-only mode', () => {
    expect(
      parseJobsRunOptions([
        '--cron=*/5 * * * * *',
        '--limit',
        '0',
        '--all-queues',
        '--handle-schedules',
      ]),
    ).toEqual({
      cron: '*/5 * * * * *',
      limit: 0,
      allQueues: true,
      handleSchedules: true,
      help: false,
    });

    expect(parseJobsRunOptions(['--queue=mail=priority', '--limit=6']).queue).toBe('mail=priority');

    expect(parseJobsRunOptions(['--cron', '*/5 * * * * *', '--queue', 'mail']).cron).toBe(
      '*/5 * * * * *',
    );
  });

  it.each(['--help', '-h'])('recognizes %s', (flag) => {
    expect(parseJobsRunOptions([flag]).help).toBe(true);
  });

  it.each(['-1', '1.5', 'NaN', 'Infinity', '1e2', '0x10', '+1', ' 1 ', '9007199254740992'])(
    'rejects invalid limit %s',
    (value) => {
      expect(() => parseJobsRunOptions(['--limit', value])).toThrow('nonnegative safe integer');
    },
  );

  it.each(['--cron', '--limit', '--queue'])('rejects missing and empty %s values', (flag) => {
    for (const args of [[flag], [`${flag}=`], [flag, ' '], [flag, '--handle-schedules']]) {
      expect(() => parseJobsRunOptions(args)).toThrow('requires a value');
    }
  });

  it.each([
    ['--queue', 'mail', '--all-queues'],
    ['--all-queues', '--queue=mail'],
  ])('rejects conflicting queue selection %j', (...args) => {
    expect(() => parseJobsRunOptions(args)).toThrow('mutually exclusive');
  });

  it.each([
    ['--limit', '1', '--limit=2'],
    ['--all-queues', '--all-queues'],
    ['--help', '-h'],
  ])('rejects duplicate options %j', (...args) => {
    expect(() => parseJobsRunOptions(args)).toThrow('Duplicate option');
  });

  it.each(['--all-queues=false', '--handle-schedules=true', '--help=yes'])(
    'rejects a boolean value for %s',
    (arg) => {
      expect(() => parseJobsRunOptions([arg])).toThrow('does not accept a value');
    },
  );

  it.each(['--unknown', 'mail', '--', '-q'])('rejects unknown argument %s', (arg) => {
    expect(() => parseJobsRunOptions([arg])).toThrow('Unknown option');
  });

  it.each(['invalid', '* * *', '60 * * * * *', '2026-10-01T00:00:00Z'])(
    'rejects invalid cron %s before boot',
    (cron) => {
      expect(() => parseJobsRunOptions(['--cron', cron])).toThrow('Invalid --cron expression');
    },
  );
});

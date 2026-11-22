import type { JobsConfig, TaskConfig } from 'payload';
import { describe, expect, it } from 'vitest';

import {
  FROGBOT_QUEUE,
  frogbotAutoRun,
  isFrogBotQueue,
  resolveFrogBotAutoRun,
  withFrogBotAutoRun,
} from '../../../../packages/frogbot/src/jobs/autoRun.js';

const handler = () => ({ output: {} });

const scheduled = (slug: string, queue: string): TaskConfig => ({
  slug,
  handler,
  schedule: [{ cron: '0 0 * * *', queue }],
});

const resolve = (jobs: JobsConfig, queues: string[] = []) =>
  resolveFrogBotAutoRun({ housekeeping: ['frogbot-sweep-waitpoints'], jobs, queues });

describe('isFrogBotQueue', () => {
  it.each([
    ['frogbot', true],
    ['frogbot-schedule:ops:tick', true],
    ['default', false],
    ['frogbots', false],
    ['app-frogbot', false],
  ])('%s → %s', (queue, expected) => {
    expect(isFrogBotQueue(queue)).toBe(expected);
  });
});

describe('withFrogBotAutoRun', () => {
  const app = { queue: 'app', cron: '*/5 * * * *' };

  it("keeps the app's entries and appends each queue's runner once", () => {
    expect(withFrogBotAutoRun([app, frogbotAutoRun('frogbot')], ['frogbot', 'frogbot-x'])).toEqual([
      app,
      frogbotAutoRun('frogbot'),
      frogbotAutoRun('frogbot-x'),
    ]);
  });

  it('composes an app autoRun function', async () => {
    const payload = {} as never;
    const autoRun = withFrogBotAutoRun(
      (value) => Promise.resolve(value === payload ? [app] : []),
      [FROGBOT_QUEUE],
    );

    expect(typeof autoRun).toBe('function');
    expect(await (autoRun as (p: never) => Promise<unknown>)(payload)).toEqual([
      app,
      frogbotAutoRun(FROGBOT_QUEUE),
    ]);
  });
});

describe('resolveFrogBotAutoRun', () => {
  it('adds no runner with no FrogBot work', () => {
    expect(resolve({ tasks: [{ slug: 'plain', handler }] })).not.toHaveProperty('autoRun');
  });

  it('adds no runner for housekeeping alone', () => {
    expect(
      resolve({ tasks: [scheduled('frogbot-sweep-waitpoints', 'frogbot')] }),
    ).not.toHaveProperty('autoRun');
  });

  it("adds no runner for the app's own scheduled queues", () => {
    expect(resolve({ tasks: [scheduled('digest', 'default')] })).not.toHaveProperty('autoRun');
  });

  it('moves housekeeping to the frogbot queue only when the runner turns on', () => {
    const sweep = scheduled('frogbot-sweep-waitpoints', 'default');

    expect(resolve({ tasks: [sweep] }).tasks).toEqual([sweep]);
    expect(resolve({ tasks: [sweep] }, [FROGBOT_QUEUE]).tasks?.[0]?.schedule).toEqual([
      { cron: '0 0 * * *', queue: FROGBOT_QUEUE },
    ]);
  });

  it('runs the frogbot queue for a task scheduled on it', () => {
    expect(resolve({ tasks: [scheduled('plugin-retention', FROGBOT_QUEUE)] }).autoRun).toEqual([
      frogbotAutoRun(FROGBOT_QUEUE),
    ]);
  });

  it('runs each FrogBot queue once, and frogbot with them', () => {
    const jobs = resolve(
      {
        autoRun: [{ queue: 'app' }],
        tasks: [scheduled('a', 'frogbot-schedule:ops:a'), scheduled('b', 'frogbot-schedule:ops:a')],
        workflows: [
          { slug: 'w', handler: [], schedule: [{ cron: '0 0 * * *', queue: 'frogbot-poll:x' }] },
        ],
      },
      ['frogbot-trigger:ops:t', 'frogbot-trigger:ops:t'],
    );

    expect(jobs.autoRun).toEqual([
      { queue: 'app' },
      ...['frogbot', 'frogbot-trigger:ops:t', 'frogbot-schedule:ops:a', 'frogbot-poll:x'].map(
        frogbotAutoRun,
      ),
    ]);
  });
});

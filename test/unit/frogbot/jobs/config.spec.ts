import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveJobsConfig } from '../../../../packages/frogbot/src/jobs/config.js';
import { setup } from './helpers.js';

afterEach(() => vi.useRealTimers());

describe('jobs schema', () => {
  it('rejects a maximum expiry duration past the year 9999', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T00:00:00.000Z'));

    const maxExpiresIn = Date.parse('9999-12-31T23:59:59.999Z') - Date.now() + 1;

    expect(() => resolveJobsConfig({ waitpoints: { maxExpiresIn } })).toThrow(
      'FrogBot jobs.waitpoints.maxExpiresIn must keep expiry on or before 9999-12-31T23:59:59.999Z.',
    );
  });

  it('accepts a maximum expiry at the last millisecond of the year 9999', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T00:00:00.000Z'));

    const maxExpiresIn = Date.parse('9999-12-31T23:59:59.999Z') - Date.now();

    expect(resolveJobsConfig({ waitpoints: { maxExpiresIn } }).waitpoints.maxExpiresIn).toBe(
      maxExpiresIn,
    );
  });

  it.each([
    [undefined, true],
    [true, true],
    [false, false],
  ])('resolves enableConcurrencyControl %s to %s', (enableConcurrencyControl, expected) => {
    expect(resolveJobsConfig({ enableConcurrencyControl }).enableConcurrencyControl).toBe(expected);
  });

  it.each([{ runHooks: true }, { depth: 1 }, { depth: 0.5 }, { depth: Infinity }])(
    'rejects unsafe execution options %j before native configuration',
    async (options) => {
      await expect(setup({ jobs: { leaseDuration: 5000, ...options } })).rejects.toThrow(
        options.runHooks ? 'jobs.runHooks is unsupported' : 'jobs.depth must be 0',
      );
    },
  );

  it.each([{}, { runHooks: false, depth: 0 }, { depth: -1 }, { depth: NaN }])(
    'always resolves safe native execution flags for %j',
    async (options) => {
      const { payload } = await setup({ jobs: { leaseDuration: 5000, ...options } });

      expect(payload.config.jobs).toMatchObject({ runHooks: false, depth: 0 });
    },
  );

  it('always creates lease fields and a nullable jobId without a full index alongside generated IDs', async () => {
    const { payload } = await setup({ jobs: { tasks: [] } });

    const collection = payload.config.collections.find(({ slug }) => slug === 'payload-jobs')!;

    expect(collection.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'jobId', type: 'text', required: false }),
        expect.objectContaining({ name: 'leaseUntil', type: 'date', index: true }),
        expect.objectContaining({ name: 'leaseOwner', type: 'text', hidden: true }),
      ]),
    );

    const jobId = collection.fields.find((field) => 'name' in field && field.name === 'jobId');

    expect(jobId).not.toHaveProperty('unique');
    expect(jobId).not.toHaveProperty('index');

    expect(collection.fields.some((field) => 'name' in field && field.name === 'id')).toBe(false);

    expect(
      payload.config.jobs.tasks.find(({ slug }) => slug === 'frogbot-sweep-jobs')?.schedule,
    ).toEqual([expect.objectContaining({ cron: '* * * * *', queue: 'default' })]);
  });

  it('preserves user overrides while protecting owned fields', async () => {
    const { payload } = await setup({
      jobs: {
        jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
          ...defaultJobsCollection,
          admin: { ...defaultJobsCollection.admin, hidden: false },
          fields: [
            ...defaultJobsCollection.fields,
            { name: 'custom', type: 'text' },
            { name: 'jobId', type: 'number', required: true },
            { name: 'leaseOwner', type: 'text', hidden: false },
          ],
        }),
      },
    });

    const collection = payload.config.collections.find(({ slug }) => slug === 'payload-jobs')!;

    expect(collection.admin.hidden).toBe(false);

    expect(collection.fields.filter((field) => 'name' in field && field.name === 'jobId')).toEqual([
      expect.objectContaining({ type: 'text', required: false }),
    ]);

    expect(collection.fields).toContainEqual(expect.objectContaining({ name: 'custom' }));

    expect(collection.fields).toContainEqual(
      expect.objectContaining({ name: 'leaseOwner', hidden: true }),
    );
  });

  it.each([0, -1, 4, 5.1, NaN, Infinity, 2_147_483_648])(
    'rejects invalid duration %s',
    (leaseDuration) => {
      expect(() => resolveJobsConfig({ leaseDuration })).toThrow('milliseconds');
    },
  );
});

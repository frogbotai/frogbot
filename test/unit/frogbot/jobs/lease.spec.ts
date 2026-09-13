import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getJobClaimFields,
  getJobLeaseContext,
  recordJobClaims,
  renewJobLease,
  resetJobLease,
} from '../../../../packages/frogbot/src/jobs/lease.js';
import { sweepJobLeases } from '../../../../packages/frogbot/src/jobs/sweep.js';
import type { LeaseRow } from './helpers.js';
import { setup } from './helpers.js';
import { jobRow, nativeRunner } from './nativeRunner.js';

afterEach(() => vi.useRealTimers());

describe('job lease ownership', () => {
  it('shares context with native claims using safe execution defaults', async () => {
    const { payload, req, database, install } = await setup();
    const owners: string[] = [];

    database.updateJobs = vi.fn(async () => {
      owners.push(getJobLeaseContext()!.owner);

      return [];
    });

    install();

    await payload.jobs.run({ req });
    await payload.jobs.runByID({ id: 42, req });

    expect(owners).toHaveLength(2);
    expect(new Set(owners).size).toBe(2);
    expect(getJobLeaseContext()).toBeUndefined();
  });

  it.each(['batch', 'by-ID'])(
    'executes only the claimed %s jobs without collection hooks',
    async (mode) => {
      const rows = [jobRow(7), jobRow(8)];
      const hookIDs: (number | string)[] = [];

      const { payload, req } = await nativeRunner({
        rows,
        jobs: {
          tasks: [{ slug: 'work', handler: async () => ({ output: {} }) }],
          jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
            ...defaultJobsCollection,
            hooks: {
              ...defaultJobsCollection.hooks,
              beforeChange: [
                ({ originalDoc, data }) => {
                  hookIDs.push(originalDoc.id);

                  return data;
                },
              ],
            },
          }),
        },
      });

      if (mode === 'by-ID') await payload.jobs.runByID({ id: 7, req, silent: true });
      else await payload.jobs.run({ req, limit: 1, silent: true });

      expect(hookIDs).toEqual([]);
      expect(rows[0].completedAt).toEqual(expect.any(String));
      expect(rows[1]).toMatchObject({ processing: false, totalTried: 0, log: [] });
    },
  );

  it('renews only active, incomplete jobs owned by this worker', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T00:00:00Z'));

    const rows: LeaseRow[] = [
      { id: 1, processing: true, leaseOwner: 'current', leaseUntil: '2026-09-13T00:01:00.000Z' },
      { id: 2, processing: true, leaseOwner: 'successor', leaseUntil: '2026-09-13T00:01:00.000Z' },
      { id: 3, processing: true, leaseOwner: 'current', leaseUntil: '2026-09-12T23:59:00.000Z' },
      {
        id: 4,
        processing: true,
        leaseOwner: 'current',
        leaseUntil: '2026-09-13T00:01:00.000Z',
        completedAt: '2026-09-13T00:00:00.000Z',
      },
    ];

    const { req, install } = await setup({ rows });

    install();

    await renewJobLease({ ids: [1, 2, 3, 4], owner: 'current', req });

    expect(rows.map(({ leaseUntil }) => leaseUntil)).toEqual([
      '2026-09-13T00:05:00.000Z',
      '2026-09-13T00:01:00.000Z',
      '2026-09-12T23:59:00.000Z',
      '2026-09-13T00:01:00.000Z',
    ]);
  });

  it('cannot reset a successor or a lease renewed after the sweep read', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T00:00:00Z'));

    const rows: LeaseRow[] = [
      { id: 1, processing: true, leaseOwner: 'successor', leaseUntil: '2026-09-13T00:01:00.000Z' },
    ];

    const { req, install } = await setup({ rows });

    install();

    await resetJobLease({ id: 1, owner: 'expired', leaseUntil: '2026-09-12T23:59:00.000Z', req });
    await resetJobLease({ id: 1, owner: 'successor', leaseUntil: '2026-09-12T23:59:00.000Z', req });

    expect(rows[0].processing).toBe(true);
  });

  it('sweeps expired claims and leaves completed or active jobs alone', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T00:00:00Z'));

    const rows: LeaseRow[] = [
      { id: 1, processing: true, leaseOwner: 'crashed', leaseUntil: '2026-09-12T23:59:00.000Z' },
      { id: 2, processing: true, leaseOwner: 'active', leaseUntil: '2026-09-13T00:01:00.000Z' },
      {
        id: 3,
        processing: true,
        leaseOwner: 'done',
        leaseUntil: '2026-09-12T23:59:00.000Z',
        completedAt: '2026-09-12T23:59:00.000Z',
      },
    ];

    const { req, install } = await setup({ rows });

    install();

    await sweepJobLeases({ req });

    expect(rows[0]).toEqual({ id: 1, processing: false, leaseOwner: null, leaseUntil: null });
    expect(rows.slice(1).every(({ processing }) => processing)).toBe(true);
  });

  it('isolates parallel runs and renews until each native run settles', async () => {
    vi.useFakeTimers();

    const { payload, req, operations, install } = await setup({ jobs: { leaseDuration: 5000 } });
    const completions: (() => void)[] = [];
    const owners: string[] = [];

    payload.jobs.run = async () => {
      const context = getJobLeaseContext()!;

      owners.push(context.owner);
      recordJobClaims([owners.length]);

      expect(getJobClaimFields().leaseOwner).toBe(context.owner);

      await new Promise<void>((resolve) => completions.push(resolve));

      expect(getJobLeaseContext()?.owner).toBe(context.owner);

      return { remainingJobsFromQueried: 0 };
    };

    const jobs = install();

    const first = jobs.run({ req });
    const second = jobs.run({ req });

    await vi.advanceTimersByTimeAsync(1000);

    expect(new Set(owners).size).toBe(2);
    expect(operations.update).toHaveBeenCalledTimes(2);
    expect(getJobLeaseContext()).toBeUndefined();

    completions[0]();
    await first;
    await vi.advanceTimersByTimeAsync(1000);

    expect(operations.update).toHaveBeenCalledTimes(3);

    completions[1]();
    await second;

    expect(vi.getTimerCount()).toBe(0);
  });

  it('wraps the native REST runner that bypasses payload.jobs.run', async () => {
    const { payload, req, database, install } = await setup();

    install();

    let owner: string | undefined;

    database.updateJobs = vi.fn(async () => {
      owner = getJobLeaseContext()?.owner;

      return [];
    });

    req.query = { disableScheduling: 'true' };
    req.user = { id: 1, collection: 'users' };

    const endpoint = payload.config.collections.find(
      ({ slug }) => slug === 'payload-jobs',
    )!.endpoints;

    const run = endpoint && endpoint.find(({ path }) => path === '/run');

    const response = await run!.handler(req);

    expect(response.status).toBe(200);
    expect(owner).toEqual(expect.any(String));
    expect(getJobLeaseContext()).toBeUndefined();
  });

  it('cleans up renewal after a rejected run and surfaces the native error', async () => {
    vi.useFakeTimers();

    const { payload, req, install } = await setup();
    const failure = new Error('handler failed');

    payload.jobs.run = async () => {
      throw failure;
    };

    install();

    await expect(payload.jobs.run({ req })).rejects.toBe(failure);

    expect(vi.getTimerCount()).toBe(0);
    expect(getJobLeaseContext()).toBeUndefined();
  });

  it('never overlaps slow renewals and waits for the in-flight mutation on exit', async () => {
    vi.useFakeTimers();

    const { payload, req, operations, install } = await setup({ jobs: { leaseDuration: 5000 } });
    let completeRun!: () => void;
    let completeRenewal!: () => void;

    payload.jobs.run = async () => {
      recordJobClaims([1]);
      await new Promise<void>((resolve) => {
        completeRun = resolve;
      });

      return { remainingJobsFromQueried: 0 };
    };

    operations.update.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          completeRenewal = resolve;
        }),
    );

    install();

    let settled = false;
    const run = payload.jobs.run({ req }).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(3000);

    expect(operations.update).toHaveBeenCalledOnce();

    completeRun();
    await vi.advanceTimersByTimeAsync(0);

    expect(settled).toBe(false);

    completeRenewal();
    await run;

    expect(settled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

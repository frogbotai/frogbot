import { randomUUID } from 'node:crypto';

import type { FindArgs, Payload } from 'payload';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { adapterName, bootJobsFixture, deferred, type FrogBotJob } from './fixture.js';

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;

beforeAll(async () => {
  fixture = await bootJobsFixture({
    jobs: {
      workflows: [
        {
          slug: 'keyed',
          concurrency: ({ input }) => String(input.key),
          handler: async ({ job, tasks }) => {
            await tasks['record-effect']('effect', { input: { marker: job.input.marker } });
          },
        },
        {
          slug: 'keyed-wait',
          concurrency: ({ input }) => String(input.key),
          handler: async ({ waitFor }) => {
            await waitFor('delay', { until: new Date(Date.now() + 60_000) });
          },
        },
      ],
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  fixture.actions.clear();
});

afterAll(async () => {
  await fixture?.shutdown();
});

function track(markers: string[]) {
  const release = deferred();
  const twoEntered = deferred();
  const state = { active: 0, peak: 0, entered: 0 };

  for (const marker of markers) {
    fixture.actions.set(marker, async () => {
      state.active++;
      state.peak = Math.max(state.peak, state.active);
      state.entered++;

      if (state.entered === 2) twoEntered.resolve();

      await release.promise;

      state.active--;
    });
  }

  return {
    state,
    async settle(runs: Promise<unknown>[]) {
      await Promise.race([twoEntered.promise, ...runs]);
      release.resolve();
      await Promise.all(runs);
    },
  };
}

function isRunningKeyLookup(args: FindArgs) {
  return (
    Boolean(args.select?.concurrencyKey) && !JSON.stringify(args.where).includes('processingToken')
  );
}

function holdRunningKeyLookups(adapters: Payload['db'][], runners = 2) {
  const barrier = deferred();
  let lookups = 0;

  for (const adapter of adapters) {
    const find = adapter.find.bind(adapter);

    vi.spyOn(adapter, 'find').mockImplementation(async (args) => {
      const result = await find(args);
      if (isRunningKeyLookup(args) && lookups < runners) {
        lookups++;

        if (lookups === runners) barrier.resolve();

        await barrier.promise;
      }

      return result;
    });
  }

  return () => lookups;
}

function queueKeyed(queue: string, key: string, marker = randomUUID()) {
  return fixture.frogbot.jobs.queue({
    workflow: 'keyed',
    queue,
    input: { key, marker },
    overrideAccess: true,
  });
}

async function readJobs(queue: string) {
  const result = await fixture.payload.db.find<FrogBotJob>({
    collection: 'payload-jobs',
    where: { queue: { equals: queue } },
    sort: 'createdAt',
    limit: 0,
    pagination: false,
  });

  return result.docs;
}

async function runUntilComplete(queue: string) {
  for (let pass = 0; pass < 5; pass++) {
    const jobs = await readJobs(queue);

    if (jobs.every((job) => job.completedAt)) return jobs;

    await fixture.frogbot.jobs.run({ queue, limit: 1, overrideAccess: true });
  }

  return readJobs(queue);
}

describe(`concurrency keys: ${adapterName}`, () => {
  describe.each([
    { name: 'two runners in one process', worker: false },
    { name: 'two Payload instances', worker: true },
  ])('one holder per key: $name', ({ worker }) => {
    it('never runs two jobs with one key at once, and both complete', async () => {
      const queue = randomUUID();
      const first = await queueKeyed(queue, 'shared');
      const second = await queueKeyed(queue, 'shared');
      const markers = [first, second].map((job) => String(job.input?.marker));
      const tracker = track(markers);
      const lookups = holdRunningKeyLookups(
        worker ? [fixture.payload.db, fixture.workerPayload.db] : [fixture.payload.db],
      );

      const runner = worker ? fixture.worker : fixture.frogbot;

      await tracker.settle([
        fixture.frogbot.jobs.run({ queue, limit: 1, overrideAccess: true }),
        runner.jobs.run({ queue, limit: 1, overrideAccess: true }),
      ]);

      expect(lookups()).toBe(2);
      expect(tracker.state.peak).toBeLessThanOrEqual(1);

      const jobs = await runUntilComplete(queue);

      expect(tracker.state.peak).toBe(1);
      expect(tracker.state.entered).toBe(2);
      expect(jobs.map((job) => job.completedAt)).toEqual([expect.any(String), expect.any(String)]);
    });
  });

  it(
    'more runners than the Postgres pool has connections still finish',
    { timeout: 30_000 },
    async () => {
      const runners = 12;
      const queue = randomUUID();
      const jobs = [];

      for (let index = 0; index < runners; index++) jobs.push(await queueKeyed(queue, 'crowded'));

      const tracker = track(jobs.map((job) => String(job.input?.marker)));

      const lookups = holdRunningKeyLookups([fixture.payload.db], runners);

      await tracker.settle(
        jobs.map(() => fixture.frogbot.jobs.run({ queue, limit: 1, overrideAccess: true })),
      );

      expect(lookups()).toBe(runners);
      expect(tracker.state.peak).toBeLessThanOrEqual(1);
      expect(
        (await readJobs(queue)).filter((job) => !job.completedAt && job.processingUntil),
      ).toEqual([]);
    },
  );

  it('a yielded job keeps its tries and log, then completes on a later run', async () => {
    const queue = randomUUID();
    const holder = await queueKeyed(queue, 'yield');
    const waiting = await queueKeyed(queue, 'yield');
    const entered = deferred();
    const release = deferred();

    fixture.actions.set(String(holder.input?.marker), async () => {
      entered.resolve();
      await release.promise;
    });

    const held = fixture.frogbot.jobs.run({ queue, limit: 1, overrideAccess: true });

    await entered.promise;

    const [, before] = await readJobs(queue);
    const find = fixture.workerPayload.db.find.bind(fixture.workerPayload.db);

    vi.spyOn(fixture.workerPayload.db, 'find').mockImplementation(async (args) => {
      const result = await find(args);

      return isRunningKeyLookup(args) ? { ...result, docs: [] } : result;
    });

    await fixture.worker.jobs.run({ queue, limit: 1, overrideAccess: true });

    const [, after] = await readJobs(queue);

    const tries = ({ totalTried, log, hasError }: FrogBotJob) => ({
      totalTried,
      log: log ?? [],
      hasError,
    });

    expect(after.id).toBe(waiting.id);
    expect(tries(after)).toEqual(tries(before));
    expect(after).toMatchObject({ completedAt: null, processingUntil: null });

    release.resolve();
    await held;
    vi.restoreAllMocks();

    const jobs = await runUntilComplete(queue);

    expect(jobs.map((job) => job.completedAt)).toEqual([expect.any(String), expect.any(String)]);
  });

  it.each([
    { name: 'different keys', keys: ['left', 'right'] },
    { name: 'no key', keys: [undefined, undefined] },
  ])('jobs with $name run at the same time', async ({ keys }) => {
    const queue = randomUUID();
    const jobs = await Promise.all(
      keys.map((key) =>
        key
          ? queueKeyed(queue, key)
          : fixture.frogbot.jobs.queue({
              task: 'record-effect',
              queue,
              input: { marker: randomUUID() },
              overrideAccess: true,
            }),
      ),
    );

    const tracker = track(jobs.map((job) => String(job.input?.marker)));

    await tracker.settle([fixture.frogbot.jobs.run({ queue, limit: 2, overrideAccess: true })]);

    expect(tracker.state.peak).toBe(2);
    expect((await readJobs(queue)).map((job) => job.completedAt)).toEqual([
      expect.any(String),
      expect.any(String),
    ]);
  });

  it('a workflow paused at waitFor frees its key', async () => {
    const queue = randomUUID();
    const paused = await fixture.frogbot.jobs.queue({
      workflow: 'keyed-wait',
      queue,
      input: { key: 'paused' },
      overrideAccess: true,
    });

    await fixture.frogbot.jobs.run({ queue, limit: 1, overrideAccess: true });

    const next = await queueKeyed(queue, 'paused');

    await fixture.frogbot.jobs.run({ queue, limit: 1, overrideAccess: true });

    const [first, second] = await readJobs(queue);

    expect(first).toMatchObject({ id: paused.id, completedAt: null, processingUntil: null });
    expect(Date.parse(first.waitUntil!)).toBeGreaterThan(Date.now());
    expect(second).toMatchObject({ id: next.id, completedAt: expect.any(String) });
  });
});

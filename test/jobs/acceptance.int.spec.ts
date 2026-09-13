import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { jobLeaseOperations, renewJobLease, resetJobLease, sweepJobLeases } from 'frogbot/jobs';
import { createLocalReq } from 'payload';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { adapterName, bootJobsFixture, deferred } from './fixture.js';

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;

beforeAll(async () => {
  fixture = await bootJobsFixture();

  assert.ok(
    fixture.payload.db[jobLeaseOperations],
    'Rebuild the selected adapter before acceptance.',
  );
});

afterEach(() => {
  vi.useRealTimers();

  for (const gate of fixture?.gates.values() ?? []) gate.release.resolve();

  fixture?.gates.clear();
});

afterAll(async () => {
  await fixture?.shutdown();
});

async function readJob(id: number | string) {
  const result = await fixture.payload.db.find({
    collection: 'payload-jobs',
    where: { id: { equals: id } },
    limit: 1,
  });

  expect(result.docs).toHaveLength(1);

  return result.docs[0];
}

async function effects(queue: string) {
  return fixture.payload.find({
    collection: 'effects',
    where: { marker: { contains: queue } },
    pagination: false,
    limit: 0,
  });
}

async function queueJob(queue: string, marker = queue, extra = {}) {
  return fixture.frogbot.jobs.queue({ task: 'record-effect', queue, input: { marker }, ...extra });
}

async function enteredOrFinished(entered: Promise<void>, run: Promise<unknown>) {
  await Promise.race([
    entered,
    run.then(() => {
      throw new Error('Native runner finished without entering the gated task.');
    }),
  ]);
}

describe(`built FrogBot jobs acceptance: ${adapterName}`, () => {
  it('boots the real runtime and enforces concurrent jobId uniqueness, generated IDs and deletion reuse', async () => {
    const queue = randomUUID();
    const jobId = `dedupe-${queue}`;

    expect(fixture.frogbot.jobs).toBe(fixture.payload.jobs);
    expect(fixture.worker.jobs).not.toBe(fixture.frogbot.jobs);

    const contenders = await Promise.allSettled(
      Array.from({ length: 8 }, () => queueJob(queue, queue, { jobId })),
    );

    const winners = contenders.filter((result) => result.status === 'fulfilled');
    const rejected = contenders.filter((result) => result.status === 'rejected');

    expect(winners).toHaveLength(1);
    expect(rejected).toHaveLength(7);

    const rows = await fixture.payload.find({
      collection: 'payload-jobs',
      where: { jobId: { equals: jobId } },
    });

    const generated = await Promise.all(Array.from({ length: 4 }, () => queueJob(queue)));

    expect(rows.docs).toHaveLength(1);
    expect(new Set(generated.map(({ id }) => id)).size).toBe(4);
    expect(generated.every((job) => job.id !== jobId)).toBe(true);

    await fixture.frogbot.jobs.runByID({ id: rows.docs[0].id });

    expect(await readJob(rows.docs[0].id)).toMatchObject({ completedAt: expect.any(String) });
    await expect(queueJob(queue, queue, { jobId })).rejects.toThrow();

    await fixture.payload.delete({ collection: 'payload-jobs', id: rows.docs[0].id });

    const reused = await queueJob(queue, queue, { jobId });

    expect(reused.id).not.toBe(rows.docs[0].id);
    expect(await readJob(reused.id)).toMatchObject({ jobId });
  });

  it('partitions concurrent native batches with exactly one persisted effect per job', async () => {
    const queue = randomUUID();
    const jobs = await Promise.all(
      Array.from({ length: 12 }, (_, index) => queueJob(queue, `${queue}-${index}`)),
    );

    await Promise.all([
      fixture.frogbot.jobs.run({ queue, limit: 12 }),
      fixture.worker.jobs.run({ queue, limit: 12 }),
    ]);

    const recorded = await effects(queue);

    expect(recorded.docs).toHaveLength(12);
    expect(new Set(recorded.docs.map((effect) => effect.jobRecord))).toEqual(
      new Set(jobs.map(({ id }) => String(id))),
    );

    for (const job of jobs) {
      expect(await readJob(job.id)).toMatchObject({
        processing: false,
        hasError: false,
        completedAt: expect.any(String),
        totalTried: 1,
      });
    }
  });

  it('allows only one concurrent native runByID handler', async () => {
    const queue = randomUUID();
    const job = await queueJob(queue);
    const gate = { entered: deferred(), release: deferred() };

    fixture.gates.set(queue, gate);

    const runs = Promise.all([
      fixture.frogbot.jobs.runByID({ id: job.id }),
      fixture.worker.jobs.runByID({ id: job.id }),
    ]);

    try {
      await enteredOrFinished(gate.entered.promise, runs);

      expect(await readJob(job.id)).toMatchObject({
        processing: true,
        leaseOwner: expect.any(String),
        leaseUntil: expect.any(String),
      });
    } finally {
      gate.release.resolve();
      await runs;
    }

    expect((await effects(queue)).docs).toHaveLength(1);
    expect(await readJob(job.id)).toMatchObject({ completedAt: expect.any(String), totalTried: 1 });
  });

  it('retains native zero-limit unlimited batches beyond one hundred jobs', async () => {
    const queue = randomUUID();
    const jobs = await Promise.all(Array.from({ length: 120 }, () => queueJob(queue)));

    await fixture.frogbot.jobs.run({ queue, limit: 0 });

    const recorded = await effects(queue);
    const persisted = await fixture.payload.find({
      collection: 'payload-jobs',
      where: { queue: { equals: queue } },
      pagination: false,
      limit: 0,
    });

    expect(recorded.docs).toHaveLength(120);
    expect(new Set(recorded.docs.map((effect) => effect.jobRecord))).toEqual(
      new Set(jobs.map(({ id }) => String(id))),
    );
    expect(persisted.docs).toHaveLength(120);
    expect(
      persisted.docs.every((job) => job.completedAt && !job.processing && job.totalTried === 1),
    ).toBe(true);
  });

  it('preserves queue, where, descending sort, limit and future waitUntil eligibility', async () => {
    const queue = randomUUID();
    const jobs = [];

    for (const priority of [1, 3, 2]) {
      const job = await queueJob(queue);

      await fixture.payload.update({ collection: 'payload-jobs', id: job.id, data: { priority } });
      jobs.push(job);
    }

    const future = await queueJob(queue, queue, { waitUntil: new Date('2099-01-01') });
    const other = await queueJob(`${queue}-other`);

    await fixture.frogbot.jobs.run({
      queue,
      limit: 1,
      processingOrder: '-priority',
      where: { priority: { greater_than: 1 } },
    });

    expect((await effects(queue)).docs.map((effect) => effect.jobRecord)).toEqual([
      String(jobs[1].id),
    ]);
    expect(await readJob(jobs[0].id)).toMatchObject({ processing: false, totalTried: 0 });
    expect(await readJob(jobs[2].id)).toMatchObject({ processing: false, totalTried: 0 });
    expect(await readJob(future.id)).toMatchObject({ processing: false, totalTried: 0 });
    expect(await readJob(other.id)).toMatchObject({ processing: false, totalTried: 0 });
  });

  it('uses default atomic execution while retaining ordinary application collection hooks', async () => {
    const queue = randomUUID();

    expect(fixture.payload.config.jobs.runHooks).toBeFalsy();
    expect(fixture.payload.config.jobs.depth).toBeFalsy();

    const job = await queueJob(queue);

    await fixture.frogbot.jobs.runByID({ id: job.id });

    const recorded = await effects(queue);

    expect(recorded.docs).toHaveLength(1);
    expect(fixture.hookEvents).toContainEqual({
      id: String(recorded.docs[0].id),
      operation: 'create',
    });
    expect(await readJob(job.id)).toMatchObject({
      completedAt: expect.any(String),
      leaseOwner: expect.any(String),
      leaseUntil: expect.any(String),
      totalTried: 1,
    });
  });

  it.each([false, true])(
    'calls native task callbacks per attempt and restores completed checkpoints (terminal failure=%s)',
    async (alwaysFail) => {
      const queue = randomUUID();
      const job = await fixture.frogbot.jobs.queue({
        task: 'retry-effect',
        queue,
        input: { marker: queue, alwaysFail },
      });

      let checkpoint: unknown;
      let previousAttemptIDs = new Set<string>();

      for (let attempt = 1; attempt <= 3; attempt++) {
        const runner = attempt === 2 ? fixture.worker : fixture.frogbot;

        await runner.jobs.runByID({ id: job.id, silent: true });

        const persisted = await readJob(job.id);
        const recorded = await effects(queue);
        const succeeded = attempt === 3 && !alwaysFail;
        const checkpoints = persisted.log.filter((entry) => entry.taskID === 'checkpoint');
        const attempts = persisted.log.filter((entry) => entry.taskSlug === 'retry-effect');
        const newAttempts = attempts.filter((entry) => !previousAttemptIDs.has(entry.id));

        expect(persisted).toMatchObject({
          processing: false,
          totalTried: attempt,
          hasError: attempt === 3 && alwaysFail,
        });
        expect(Boolean(persisted.completedAt)).toBe(succeeded);
        expect(attempts).toHaveLength(attempt);
        expect(newAttempts).toEqual([
          expect.objectContaining({
            id: expect.any(String),
            state: succeeded ? 'succeeded' : 'failed',
          }),
        ]);

        previousAttemptIDs = new Set(attempts.map((entry) => entry.id));

        expect(checkpoints).toHaveLength(1);
        expect(checkpoints[0]).toMatchObject({
          state: 'succeeded',
          output: { marker: queue },
        });

        if (attempt === 1) checkpoint = checkpoints[0];

        expect(checkpoints[0]).toEqual(checkpoint);
        expect(recorded.docs.filter((effect) => effect.marker === queue)).toHaveLength(1);
        expect(recorded.docs.map((effect) => effect.marker).sort()).toEqual(
          [
            queue,
            ...Array.from(
              { length: succeeded ? 2 : attempt },
              (_, index) => `${queue}:onFail:${index + 1}`,
            ),
            ...(succeeded ? [`${queue}:onSuccess:3`] : []),
          ].sort(),
        );
      }

      const before = await readJob(job.id);

      await fixture.frogbot.jobs.run({ queue, silent: true });

      expect(await readJob(job.id)).toEqual(before);
      expect((await effects(queue)).docs).toHaveLength(4);
    },
  );

  it('automatically renews a long native job beyond its original lease and excludes competing workers and sweep', async () => {
    const queue = randomUUID();
    const job = await queueJob(queue);
    const gate = { entered: deferred(), release: deferred() };
    const req = await createLocalReq({}, fixture.payload);

    fixture.gates.set(queue, gate);

    const run = fixture.frogbot.jobs.run({ queue });

    try {
      await enteredOrFinished(gate.entered.promise, run);

      const initial = await readJob(job.id);

      await expect
        .poll(async () => new Date((await readJob(job.id)).leaseUntil).getTime(), {
          timeout: 15_000,
        })
        .toBeGreaterThan(new Date(initial.leaseUntil).getTime() + 5_000);

      expect(Date.now()).toBeGreaterThan(new Date(initial.leaseUntil).getTime());

      await sweepJobLeases({ req });
      await fixture.payload.jobs.runByID({ id: job.id });

      expect(await readJob(job.id)).toMatchObject({
        processing: true,
        leaseOwner: initial.leaseOwner,
      });
      expect((await effects(queue)).docs).toHaveLength(0);
    } finally {
      gate.release.resolve();
      await run;
    }

    expect((await effects(queue)).docs).toHaveLength(1);
  });

  it('sweeps an expired crash, reclaims it, and fences stale renewal/reset against its successor', async () => {
    const queue = randomUUID();
    const job = await queueJob(queue);
    const req = await createLocalReq({}, fixture.payload);
    const expired = '2020-01-01T00:00:00.000Z';

    await fixture.payload.db.updateOne({
      collection: 'payload-jobs',
      id: job.id,
      data: { processing: true, leaseOwner: 'crashed', leaseUntil: expired },
    });

    await sweepJobLeases({ req });

    expect(await readJob(job.id)).toMatchObject({ processing: false });

    const gate = { entered: deferred(), release: deferred() };

    fixture.gates.set(queue, gate);

    const run = fixture.frogbot.jobs.runByID({ id: job.id });

    try {
      await enteredOrFinished(gate.entered.promise, run);

      const successor = await readJob(job.id);

      await resetJobLease({ id: job.id, owner: 'crashed', leaseUntil: expired, req });
      await renewJobLease({ ids: [job.id], owner: 'crashed', req });

      expect(await readJob(job.id)).toMatchObject({
        processing: true,
        leaseOwner: successor.leaseOwner,
        leaseUntil: successor.leaseUntil,
      });
    } finally {
      gate.release.resolve();
      await run;
    }

    expect((await effects(queue)).docs).toHaveLength(1);

    await fixture.payload.db.updateOne({
      collection: 'payload-jobs',
      id: job.id,
      data: { processing: true, leaseOwner: 'completed', leaseUntil: expired },
    });

    await sweepJobLeases({ req });

    expect(await readJob(job.id)).toMatchObject({
      processing: true,
      leaseOwner: 'completed',
      completedAt: expect.any(String),
    });
  });

  it('retains ordinary update, cancellation, and persisted job log behavior', async () => {
    const queue = randomUUID();
    const job = await queueJob(queue);

    await fixture.payload.update({
      collection: 'payload-jobs',
      id: job.id,
      data: { priority: 42 },
    });

    await fixture.frogbot.jobs.runByID({ id: job.id });

    expect(await readJob(job.id)).toMatchObject({
      priority: 42,
      log: [expect.objectContaining({ state: 'succeeded' })],
    });

    const cancelled = await queueJob(queue);

    await fixture.frogbot.jobs.cancelByID({ id: cancelled.id });
    await fixture.frogbot.jobs.run({ queue });

    expect(await readJob(cancelled.id)).toMatchObject({
      processing: false,
      hasError: true,
      error: { cancelled: true },
    });
    expect((await effects(queue)).docs).toHaveLength(1);
  });

  it('queues the injected minute sweep through native scheduling and runs its persisted job', async () => {
    const queue = randomUUID();
    const crashed = await queueJob(queue);

    await fixture.payload.db.updateOne({
      collection: 'payload-jobs',
      id: crashed.id,
      data: {
        processing: true,
        leaseOwner: 'scheduled-crash',
        leaseUntil: '2020-01-01T00:00:00.000Z',
      },
    });

    const result = await fixture.frogbot.jobs.handleSchedules({ queue: 'default' });
    const scheduled = await fixture.payload.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: 'frogbot-sweep-jobs' } },
      limit: 0,
    });

    expect(result.errored).toEqual([]);
    expect(scheduled.docs).toHaveLength(1);
    expect(scheduled.docs[0]).toMatchObject({
      queue: 'default',
      meta: { scheduled: true },
      waitUntil: expect.any(String),
    });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(new Date(scheduled.docs[0].waitUntil).getTime() + 1));

    try {
      await fixture.frogbot.jobs.run({
        queue: 'default',
        where: { taskSlug: { equals: 'frogbot-sweep-jobs' } },
      });
    } finally {
      vi.useRealTimers();
    }

    expect(await readJob(crashed.id)).toMatchObject({ processing: false });
    expect(await readJob(scheduled.docs[0].id)).toMatchObject({
      completedAt: expect.any(String),
      hasError: false,
    });
  });

  it('executes the native REST jobs route with persisted effects and lease context', async () => {
    const queue = randomUUID();
    const job = await queueJob(queue);
    const response = await fixture.frogbot.handleRequest(
      new Request(`http://localhost/api/payload-jobs/run?queue=${queue}&disableScheduling=true`),
    );

    expect(response.status).toBe(200);
    expect((await effects(queue)).docs).toHaveLength(1);
    expect(await readJob(job.id)).toMatchObject({
      completedAt: expect.any(String),
      hasError: false,
    });
  });
});

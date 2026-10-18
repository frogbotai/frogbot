import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';

import { adapterName, bootJobsFixture, deferred, type FrogBotJob, timestamp } from './fixture.js';

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;

beforeAll(async () => {
  fixture = await bootJobsFixture();
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
  const result = await fixture.payload.db.find<FrogBotJob>({
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
    overrideAccess: true,
  });
}

async function queueJob(queue: string, marker = queue, extra = {}) {
  return fixture.frogbot.jobs.queue({
    task: 'record-effect',
    queue,
    input: { marker },
    overrideAccess: true,
    ...extra,
  });
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
  it('a jobId whose job failed for good can be queued again', async () => {
    const queue = randomUUID();
    const jobId = `failed-${queue}`;
    const first = await fixture.frogbot.jobs.queue({
      task: 'fail-for-good',
      input: undefined,
      queue,
      jobId,
      overrideAccess: true,
    });

    await fixture.frogbot.jobs.runByID({ id: first.id, silent: true, overrideAccess: true });

    expect(await readJob(first.id)).toMatchObject({ hasError: true });

    const second = await fixture.frogbot.jobs.queue({
      task: 'fail-for-good',
      input: undefined,
      queue,
      jobId,
      overrideAccess: true,
    });

    expect(second.id).not.toBe(first.id);
    expect(await readJob(second.id)).toMatchObject({ jobId, hasError: false });
  });

  it('a jobId whose completed job is kept can be queued again', async () => {
    const queue = randomUUID();
    const jobId = `completed-${queue}`;
    const first = await queueJob(queue, queue, { jobId });

    await fixture.frogbot.jobs.runByID({ id: first.id, overrideAccess: true });

    expect(await readJob(first.id)).toMatchObject({ completedAt: expect.any(String) });

    const second = await queueJob(queue, queue, { jobId });

    expect(second.id).not.toBe(first.id);
    expect(await readJob(second.id)).toMatchObject({ jobId, hasError: false });
  });

  it('boots the real runtime and enforces concurrent jobId uniqueness, generated IDs and deletion reuse', async () => {
    const queue = randomUUID();
    const jobId = `dedupe-${queue}`;

    expect(fixture.frogbot.jobs).toBe(fixture.payload.jobs);
    expect(fixture.worker.jobs).not.toBe(fixture.frogbot.jobs);

    const contenders = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        (index < 4 ? fixture.frogbot.jobs : fixture.worker.jobs).queue({
          task: 'record-effect',
          queue,
          input: { marker: queue },
          jobId,
          overrideAccess: true,
        }),
      ),
    );

    const winners = contenders.filter((result) => result.status === 'fulfilled');
    const rejected = contenders.filter((result) => result.status === 'rejected');

    expect(rejected).toHaveLength(0);
    expect(winners).toHaveLength(8);
    expect(new Set(winners.map((result) => result.value.id)).size).toBe(1);

    const rows = await fixture.payload.find({
      collection: 'payload-jobs',
      where: { jobId: { equals: jobId } },
      overrideAccess: true,
    });

    const generated = await Promise.all(Array.from({ length: 4 }, () => queueJob(queue)));

    expect(rows.docs).toHaveLength(1);
    expect(new Set(generated.map(({ id }) => id)).size).toBe(4);
    expect(generated.every((job) => job.id !== jobId)).toBe(true);

    await fixture.frogbot.jobs.runByID({ id: rows.docs[0].id, overrideAccess: true });

    expect(await readJob(rows.docs[0].id)).toMatchObject({ completedAt: expect.any(String) });

    const completedReuse = await queueJob(queue, queue, { jobId });

    expect(completedReuse.id).not.toBe(rows.docs[0].id);

    await fixture.payload.delete({
      collection: 'payload-jobs',
      id: completedReuse.id,
      overrideAccess: true,
    });

    const reused = await queueJob(queue, queue, { jobId });

    expect(reused.id).not.toBe(rows.docs[0].id);
    expect(await readJob(reused.id)).toMatchObject({ jobId });
  });

  it('a duplicate live jobId resolves with the existing job and ignores its arguments', async () => {
    const queue = randomUUID();
    const jobId = `arguments-${queue}`;
    const first = await queueJob(queue, 'original', { jobId });

    const duplicate = await fixture.worker.jobs.queue({
      task: 'retry-effect',
      input: { marker: 'ignored', alwaysFail: true },
      queue: `ignored-${queue}`,
      waitUntil: new Date('2099-01-01T00:00:00.000Z'),
      meta: { ignored: true },
      jobId,
      overrideAccess: true,
    });

    const rows = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      where: { jobId: { equals: jobId } },
      pagination: false,
    });

    expect(duplicate).toEqual(first);
    expect(rows.docs).toHaveLength(1);
    expect(rows.docs[0]).toMatchObject({
      id: first.id,
      taskSlug: 'record-effect',
      input: { marker: 'original' },
      queue,
    });
  });

  it('partitions concurrent native batches with exactly one persisted effect per job', async () => {
    const queue = randomUUID();
    const jobs = await Promise.all(
      Array.from({ length: 12 }, (_, index) => queueJob(queue, `${queue}-${index}`)),
    );

    await Promise.all([
      fixture.frogbot.jobs.run({ queue, limit: 12, overrideAccess: true }),
      fixture.worker.jobs.run({ queue, limit: 12, overrideAccess: true }),
    ]);

    const recorded = await effects(queue);

    expect(recorded.docs).toHaveLength(12);
    expect(new Set(recorded.docs.map((effect) => effect.jobRecord))).toEqual(
      new Set(jobs.map(({ id }) => String(id))),
    );

    for (const job of jobs) {
      expect(await readJob(job.id)).toMatchObject({
        processingUntil: null,
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
      fixture.frogbot.jobs.runByID({ id: job.id, overrideAccess: true }),
      fixture.worker.jobs.runByID({ id: job.id, overrideAccess: true }),
    ]);

    onTestFinished(async () => {
      gate.release.resolve();
      await runs;
    });

    await enteredOrFinished(gate.entered.promise, runs);

    expect(await readJob(job.id)).toMatchObject({
      processingToken: expect.any(String),
      processingUntil: expect.any(String),
    });

    gate.release.resolve();
    await runs;

    expect((await effects(queue)).docs).toHaveLength(1);
    expect(await readJob(job.id)).toMatchObject({ completedAt: expect.any(String), totalTried: 1 });
  });

  it('retains native zero-limit unlimited batches beyond one hundred jobs', async () => {
    const queue = randomUUID();
    const jobs = await Promise.all(Array.from({ length: 120 }, () => queueJob(queue)));

    await fixture.frogbot.jobs.run({ queue, limit: 0, overrideAccess: true });

    const recorded = await effects(queue);
    const persisted = await fixture.payload.find({
      collection: 'payload-jobs',
      where: { queue: { equals: queue } },
      pagination: false,
      limit: 0,
      overrideAccess: true,
    });

    expect(recorded.docs).toHaveLength(120);
    expect(new Set(recorded.docs.map((effect) => effect.jobRecord))).toEqual(
      new Set(jobs.map(({ id }) => String(id))),
    );
    expect(persisted.docs).toHaveLength(120);
    expect(
      persisted.docs.every(
        (job) => job.completedAt && !job.processingUntil && job.totalTried === 1,
      ),
    ).toBe(true);
  });

  it('preserves queue, where, descending sort, limit and future waitUntil eligibility', async () => {
    const queue = randomUUID();
    const jobs = [];

    for (const priority of [1, 3, 2]) {
      const job = await queueJob(queue);

      await fixture.payload.update({
        collection: 'payload-jobs',
        id: job.id,
        data: { priority },
        overrideAccess: true,
      });

      jobs.push(job);
    }

    const future = await queueJob(queue, queue, { waitUntil: new Date('2099-01-01') });
    const other = await queueJob(`${queue}-other`);

    await fixture.frogbot.jobs.run({
      queue,
      limit: 1,
      processingOrder: '-priority',
      where: { priority: { greater_than: 1 } },
      overrideAccess: true,
    });

    expect((await effects(queue)).docs.map((effect) => effect.jobRecord)).toEqual([
      String(jobs[1].id),
    ]);

    for (const job of [jobs[0], jobs[2], future, other]) {
      const row = await readJob(job.id);

      expect(row.totalTried).toBe(0);
      expect(row.processingUntil ?? null).toBeNull();
    }
  });

  it('uses default atomic execution while retaining ordinary application collection hooks', async () => {
    const queue = randomUUID();

    const job = await queueJob(queue);

    await fixture.frogbot.jobs.runByID({ id: job.id, overrideAccess: true });

    const recorded = await effects(queue);

    expect(recorded.docs).toHaveLength(1);
    expect(fixture.hookEvents).toContainEqual({
      id: String(recorded.docs[0].id),
      operation: 'create',
    });
    expect(await readJob(job.id)).toMatchObject({
      completedAt: expect.any(String),
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
        overrideAccess: true,
      });

      let checkpoint: unknown;
      let previousAttemptIDs = new Set<string>();

      for (let attempt = 1; attempt <= 3; attempt++) {
        const runner = attempt === 2 ? fixture.worker : fixture.frogbot;

        await runner.jobs.runByID({ id: job.id, silent: true, overrideAccess: true });

        const persisted = await readJob(job.id);
        const recorded = await effects(queue);
        const succeeded = attempt === 3 && !alwaysFail;
        const checkpoints = (persisted.log ?? []).filter((entry) => entry.taskID === 'checkpoint');
        const attempts = (persisted.log ?? []).filter((entry) => entry.taskSlug === 'retry-effect');
        const newAttempts = attempts.filter((entry) => !previousAttemptIDs.has(entry.id));

        expect(persisted).toMatchObject({
          processingUntil: null,
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

      await fixture.frogbot.jobs.run({ queue, silent: true, overrideAccess: true });

      expect(await readJob(job.id)).toEqual(before);
      expect((await effects(queue)).docs).toHaveLength(4);
    },
  );

  it('renews a long job beyond its original lease and excludes competing workers', async () => {
    const queue = randomUUID();
    const job = await queueJob(queue);
    const gate = { entered: deferred(), release: deferred() };

    fixture.gates.set(queue, gate);

    const run = fixture.frogbot.jobs.run({ queue, overrideAccess: true });

    onTestFinished(async () => {
      gate.release.resolve();
      await run;
    });

    await enteredOrFinished(gate.entered.promise, run);

    const initial = await readJob(job.id);

    await expect
      .poll(() => Date.now(), { timeout: 15_000 })
      .toBeGreaterThan(timestamp(initial.processingUntil) + 500);

    expect(timestamp((await readJob(job.id)).processingUntil)).toBeGreaterThan(Date.now());

    await fixture.worker.jobs.runByID({ id: job.id, overrideAccess: true });

    expect(await readJob(job.id)).toMatchObject({ processingToken: initial.processingToken });
    expect((await effects(queue)).docs).toHaveLength(0);

    gate.release.resolve();
    await run;

    expect((await effects(queue)).docs).toHaveLength(1);
  });

  it("reclaims a crashed worker's job once its lease has expired, and only then", async () => {
    const queue = randomUUID();
    const job = await queueJob(queue);
    const lease = (processingUntil: string) =>
      fixture.payload.db.updateOne({
        collection: 'payload-jobs',
        id: job.id,
        data: { processingToken: 'crashed', processingUntil },
      });

    await lease(new Date(Date.now() + 60_000).toISOString());
    await fixture.worker.jobs.runByID({ id: job.id, overrideAccess: true });

    expect((await effects(queue)).docs).toHaveLength(0);

    await lease('2020-01-01T00:00:00.000Z');
    await fixture.worker.jobs.runByID({ id: job.id, overrideAccess: true });

    expect((await effects(queue)).docs).toHaveLength(1);
    expect(await readJob(job.id)).toMatchObject({ completedAt: expect.any(String), totalTried: 1 });
  });

  it('retains ordinary update, cancellation, and persisted job log behavior', async () => {
    const queue = randomUUID();
    const job = await queueJob(queue);

    await fixture.payload.update({
      collection: 'payload-jobs',
      id: job.id,
      data: { priority: 42 },
      overrideAccess: true,
    });

    await fixture.frogbot.jobs.runByID({ id: job.id, overrideAccess: true });

    expect(await readJob(job.id)).toMatchObject({
      priority: 42,
      log: [expect.objectContaining({ state: 'succeeded' })],
    });

    const cancelled = await queueJob(queue);

    await fixture.frogbot.jobs.cancelByID({ id: cancelled.id, overrideAccess: true });
    await fixture.frogbot.jobs.run({ queue, overrideAccess: true });

    expect(await readJob(cancelled.id)).toMatchObject({
      processingUntil: null,
      hasError: true,
      error: { cancelled: true },
    });
    expect((await effects(queue)).docs).toHaveLength(1);
  });

  it('queues the waitpoint sweep through native scheduling and runs its persisted job', async () => {
    const result = await fixture.frogbot.jobs.handleSchedules({ queue: 'default' });
    const scheduled = await fixture.payload.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: 'frogbot-sweep-waitpoints' } },
      limit: 0,
      overrideAccess: true,
    });

    expect(result.errored).toEqual([]);
    expect(scheduled.docs).toHaveLength(1);
    expect(scheduled.docs[0]).toMatchObject({
      queue: 'default',
      meta: { scheduled: true },
      waitUntil: expect.any(String),
    });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(timestamp(scheduled.docs[0].waitUntil) + 1));

    await fixture.frogbot.jobs.run({
      queue: 'default',
      where: { taskSlug: { equals: 'frogbot-sweep-waitpoints' } },
      overrideAccess: true,
    });

    vi.useRealTimers();

    expect(await readJob(scheduled.docs[0].id)).toMatchObject({
      completedAt: expect.any(String),
      hasError: false,
    });
  });

  it('executes the native REST jobs route with persisted effects', async () => {
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

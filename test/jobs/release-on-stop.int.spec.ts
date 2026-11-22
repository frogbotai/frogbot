import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { stopJobs } from '../../packages/frogbot/dist/jobs/stop.js';
import { bootJobsFixture, deferred, type FrogBotJob } from './fixture.js';

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;

beforeAll(async () => {
  fixture = await bootJobsFixture();
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

  return result.docs[0];
}

it('a stopped server gives back the job it was running, and the next runner takes it at once', async () => {
  const queue = randomUUID();
  const gate = { entered: deferred(), release: deferred() };

  fixture.gates.set(queue, gate);

  const job = await fixture.frogbot.jobs.queue({
    task: 'record-effect',
    queue,
    input: { marker: queue },
    overrideAccess: true,
  });

  const run = fixture.frogbot.jobs.run({ queue, overrideAccess: true });

  await gate.entered.promise;

  expect((await readJob(job.id)).processingToken).toBeTruthy();

  await stopJobs({ payload: fixture.payload });

  expect(await readJob(job.id)).toMatchObject({ processingToken: null, processingUntil: null });

  const second = await fixture.frogbot.jobs.queue({
    task: 'record-effect',
    queue,
    input: { marker: `${queue}-after-stop` },
    overrideAccess: true,
  });

  await fixture.frogbot.jobs.run({ queue, overrideAccess: true });

  expect((await readJob(second.id)).processingToken ?? null).toBeNull();
  expect((await readJob(second.id)).completedAt ?? null).toBeNull();

  fixture.gates.delete(queue);

  await fixture.worker.jobs.runByID({ id: job.id, overrideAccess: true });

  const taken = await readJob(job.id);

  expect(taken.completedAt).toBeTruthy();

  const effects = await fixture.payload.find({
    collection: 'effects',
    where: { jobRecord: { equals: String(job.id) } },
    pagination: false,
    overrideAccess: true,
  });

  expect(effects.docs).toHaveLength(1);

  gate.release.resolve();

  await run;
});

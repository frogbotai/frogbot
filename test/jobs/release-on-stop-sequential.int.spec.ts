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

it('after a stop, a sequential run does not start a job whose lease it gave back', async () => {
  const queue = randomUUID();
  const first = `${queue}-1`;
  const gate = { entered: deferred(), release: deferred() };

  fixture.gates.set(first, gate);

  const job1 = await fixture.frogbot.jobs.queue({
    task: 'record-effect',
    queue,
    input: { marker: first },
    overrideAccess: true,
  });

  const job2 = await fixture.frogbot.jobs.queue({
    task: 'record-effect',
    queue,
    input: { marker: `${queue}-2` },
    overrideAccess: true,
  });

  const run = fixture.frogbot.jobs.run({ queue, limit: 2, sequential: true, overrideAccess: true });

  await gate.entered.promise;

  const token = (await readJob(job2.id)).processingToken;

  expect(token).toBeTruthy();
  expect((await readJob(job1.id)).processingToken).toBe(token);

  await stopJobs({ payload: fixture.payload });

  expect(await readJob(job2.id)).toMatchObject({ processingToken: null, processingUntil: null });

  gate.release.resolve();
  await run;

  const effects = await fixture.payload.find({
    collection: 'effects',
    where: { jobRecord: { equals: String(job2.id) } },
    pagination: false,
    overrideAccess: true,
  });

  expect(effects.docs).toHaveLength(0);
});

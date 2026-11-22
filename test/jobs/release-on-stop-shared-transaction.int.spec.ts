import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { stopJobs } from '../../packages/frogbot/dist/jobs/stop.js';
import { bootJobsFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;

beforeAll(async () => {
  fixture = await bootJobsFixture({ transactions: true });
});

afterAll(async () => {
  await fixture?.shutdown();
});

it('two claims in one committed transaction do not make the stop hang', async () => {
  const queue = randomUUID();

  for (const marker of ['a', 'b']) {
    await fixture.frogbot.jobs.queue({
      task: 'record-effect',
      queue,
      input: { marker: `${queue}-${marker}` },
      overrideAccess: true,
    });
  }

  const db = fixture.payload.db;
  const transactionID = (await db.beginTransaction())!;
  const claim = () =>
    db.updateJobs({
      data: {
        processingToken: randomUUID(),
        processingUntil: new Date(Date.now() + 60_000).toISOString(),
      },
      limit: 1,
      req: { transactionID },
      returning: true,
      where: { and: [{ queue: { equals: queue } }, { processingUntil: { exists: false } }] },
    });

  expect(await claim()).toHaveLength(1);
  expect(await claim()).toHaveLength(1);

  await db.commitTransaction(transactionID);

  await stopJobs({ payload: fixture.payload });

  const { docs } = await db.find({
    collection: 'payload-jobs',
    where: { queue: { equals: queue } },
    pagination: false,
  });

  expect(docs.map((doc) => doc.processingToken ?? null)).toEqual([null, null]);
}, 5000);

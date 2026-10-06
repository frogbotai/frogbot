import { randomUUID } from 'node:crypto';

import { createLocalReq } from 'payload';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { defaultBeforeSchedule } from '../../packages/frogbot/node_modules/payload/dist/queues/operations/handleSchedules/defaultBeforeSchedule.js';
import { adapterName, bootJobsFixture, type FrogBotJob } from './fixture.js';

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;

beforeAll(async () => {
  fixture = await bootJobsFixture();
});

beforeEach(async () => {
  await fixture.payload.db.deleteMany({ collection: 'payload-jobs', where: {} });
  await fixture.payload.db.deleteMany({ collection: 'effects', where: {} });
});

afterAll(async () => {
  await fixture?.shutdown();
});

async function readJob(id: number | string) {
  const result = await fixture.payload.db.find<FrogBotJob>({
    collection: 'payload-jobs',
    where: { id: { equals: id } },
    limit: 1,
    pagination: false,
  });

  return result.docs[0];
}

describe(`live reservation states: ${adapterName}`, () => {
  it('the default schedule hook counts a scheduled task while it retries', async () => {
    const marker = randomUUID();
    const first = await fixture.frogbot.jobs.queue({
      task: 'retry-effect',
      input: { marker },
      meta: { scheduled: true },
    });

    await fixture.frogbot.jobs.runByID({ id: first.id, silent: true });

    const retrying = await readJob(first.id);
    const req = await createLocalReq({}, fixture.payload);
    const taskConfig = fixture.payload.config.jobs.tasks!.find(
      ({ slug }) => slug === 'retry-effect',
    )!;

    const decision = await defaultBeforeSchedule({
      defaultBeforeSchedule,
      jobStats: {},
      queueable: {
        taskConfig,
        scheduleConfig: { cron: '* * * * *', queue: 'default' },
        waitUntil: new Date(),
      },
      req,
    });

    expect(retrying).toMatchObject({
      completedAt: null,
      hasError: false,
      totalTried: 1,
    });
    expect(retrying.error ?? null).toBeNull();
    expect(retrying.log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskSlug: 'retry-effect', state: 'failed' }),
      ]),
    );
    expect(decision.shouldSchedule).toBe(false);
  });

  it('a failed attempt with retries left keeps its jobId and saved checkpoint', async () => {
    const jobId = randomUUID();
    const first = await fixture.frogbot.jobs.queue({
      task: 'retry-effect',
      input: { marker: jobId },
      jobId,
    });

    await fixture.frogbot.jobs.runByID({ id: first.id, silent: true });

    const before = await readJob(first.id);
    const duplicate = await fixture.worker.jobs.queue({
      task: 'record-effect',
      input: { marker: 'ignored' },
      jobId,
    });
    const after = await readJob(first.id);
    const rows = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      limit: 0,
    });

    expect(before).toMatchObject({ hasError: false, completedAt: null, totalTried: 1 });
    expect(before?.log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskID: 'checkpoint', state: 'succeeded' }),
        expect.objectContaining({ taskSlug: 'retry-effect', state: 'failed' }),
      ]),
    );
    expect(duplicate.id).toBe(first.id);
    expect(after).toEqual(before);
    expect(rows.docs).toHaveLength(1);
  });

  it('a delayed task keeps its jobId and original deadline', async () => {
    const jobId = randomUUID();
    const waitUntil = new Date(Date.now() + 60_000);
    const first = await fixture.frogbot.jobs.queue({
      task: 'record-effect',
      input: { marker: jobId },
      jobId,
      waitUntil,
    });

    const duplicate = await fixture.worker.jobs.queue({
      task: 'fail-for-good',
      input: undefined,
      jobId,
      waitUntil: new Date(),
    });

    await fixture.worker.jobs.run({ silent: true });

    const rows = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      limit: 0,
    });
    const effects = await fixture.payload.db.find({ collection: 'effects', limit: 0 });

    expect(duplicate).toEqual(first);
    expect(rows.docs).toHaveLength(1);
    expect(rows.docs[0]).toMatchObject({
      id: first.id,
      taskSlug: 'record-effect',
      waitUntil: waitUntil.toISOString(),
      processing: false,
      totalTried: 0,
    });
    expect(effects.docs).toHaveLength(0);
  });
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import type { MongooseAdapter } from '@frogbotai/db-mongodb';
import { createLocalReq, type PayloadRequest } from 'payload';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { adapterName, bootJobsFixture, type FrogBotJob } from './fixture.js';

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;
let transactionReq: PayloadRequest | undefined;

beforeAll(async () => {
  fixture = await bootJobsFixture({
    transactions: true,
    jobs: {
      workflows: [
        {
          slug: 'supersede',
          concurrency: { key: ({ input }) => String(input.key), supersedes: true },
          handler: () => undefined,
        },
      ],
    },
  });
});

beforeEach(async () => {
  await fixture.payload.db.deleteMany({ collection: 'payload-jobs', where: {} });
  await fixture.payload.db.deleteMany({ collection: 'effects', where: {} });
});

afterEach(async () => {
  const transactionID = await transactionReq?.transactionID;

  if (transactionID) await fixture.payload.db.rollbackTransaction(transactionID);

  transactionReq = undefined;
});

afterAll(async () => {
  await fixture?.shutdown();
});

async function beginTransaction() {
  const transactionID = await fixture.payload.db.beginTransaction();

  assert.ok(transactionID);

  transactionReq = await createLocalReq({ req: { transactionID } }, fixture.payload);

  return transactionReq;
}

async function earlierWrite(req: PayloadRequest, marker: string) {
  return fixture.payload.db.create({
    collection: 'effects',
    data: { marker, owner: 'transaction', jobRecord: 'earlier' },
    req,
  });
}

async function commitAndRead(req: PayloadRequest, jobId: string) {
  await fixture.payload.db.commitTransaction((await req.transactionID)!);

  transactionReq = undefined;

  const effects = await fixture.payload.db.find({ collection: 'effects', pagination: false });
  const jobs = await fixture.payload.db.find<FrogBotJob>({
    collection: 'payload-jobs',
    where: { jobId: { equals: jobId } },
    pagination: false,
  });

  return { effects: effects.docs, jobs: jobs.docs };
}

describe(`live jobId enqueue: ${adapterName}`, () => {
  it('an admin hasError edit frees the jobId immediately', async () => {
    const jobId = randomUUID();
    const first = await fixture.frogbot.jobs.queue({ task: 'record-effect', input: {}, jobId });

    await fixture.frogbot.update({
      collection: 'payload-jobs',
      id: first.id,
      data: { hasError: true },
    });

    const second = await fixture.worker.jobs.queue({ task: 'record-effect', input: {}, jobId });
    const rows = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      where: { jobId: { equals: jobId } },
      pagination: false,
    });

    expect(second.id).not.toBe(first.id);
    expect(rows.docs).toHaveLength(2);
    expect(rows.docs.find(({ id }) => id === first.id)).toMatchObject({ hasError: true });
    expect(second).toMatchObject({ jobId, hasError: false });
  });

  it.runIf(adapterName === 'mongodb')(
    'a Local API job insert stores completedAt null and reserves its jobId',
    async () => {
      const jobId = randomUUID();

      const first = await fixture.frogbot.create({
        collection: 'payload-jobs',
        data: { taskSlug: 'record-effect', input: { marker: jobId }, jobId },
      });
      const stored = await fixture.payload.db.find<FrogBotJob>({
        collection: 'payload-jobs',
        where: { id: { equals: first.id } },
        limit: 1,
        pagination: false,
      });

      const model = (fixture.payload.db as unknown as MongooseAdapter).collections['payload-jobs'];
      const raw = await model.collection.findOne({ jobId });

      const duplicate = await fixture.worker.jobs.queue({
        task: 'record-effect',
        input: {},
        jobId,
      });

      expect(raw).toHaveProperty('completedAt', null);
      expect(stored.docs).toMatchObject([
        { id: first.id, completedAt: null, hasError: false, jobId },
      ]);
      expect(duplicate.id).toBe(first.id);
      expect(
        (
          await fixture.payload.db.find<FrogBotJob>({
            collection: 'payload-jobs',
            pagination: false,
          })
        ).docs,
      ).toHaveLength(1);
    },
  );

  it.skipIf(adapterName === 'd1-sqlite')(
    'a duplicate of a committed holder inside an open transaction resolves and the transaction still commits',
    async () => {
      const jobId = randomUUID();
      const holder = await fixture.frogbot.jobs.queue({
        task: 'record-effect',
        input: { marker: jobId },
        jobId,
      });

      const req = await beginTransaction();
      const earlier = await earlierWrite(req, jobId);

      const duplicate = await fixture.frogbot.jobs.queue({
        task: 'retry-effect',
        input: {},
        jobId,
        req,
      });

      const persisted = await commitAndRead(req, jobId);

      expect(duplicate.id).toBe(holder.id);
      expect(persisted.effects).toMatchObject([{ id: earlier.id, marker: jobId }]);
      expect(persisted.jobs).toMatchObject([{ id: holder.id, jobId }]);
    },
  );

  it.skipIf(adapterName === 'd1-sqlite' || adapterName === 'mongodb')(
    'three concurrent queue calls with a new jobId in one transaction resolve with one row and preserve earlier writes',
    async () => {
      const jobId = randomUUID();
      const req = await beginTransaction();
      const earlier = await earlierWrite(req, jobId);

      const results = await Promise.all(
        Array.from({ length: 3 }, () =>
          fixture.frogbot.jobs.queue({
            task: 'record-effect',
            input: { marker: jobId },
            jobId,
            req,
          }),
        ),
      );

      const persisted = await commitAndRead(req, jobId);

      expect(new Set(results.map(({ id }) => id)).size).toBe(1);
      expect(persisted.effects).toMatchObject([{ id: earlier.id, marker: jobId }]);
      expect(persisted.jobs).toHaveLength(1);
      expect(persisted.jobs[0].id).toBe(results[0].id);
    },
  );

  it('cancelByID frees the jobId', async () => {
    const jobId = randomUUID();
    const first = await fixture.frogbot.jobs.queue({ task: 'record-effect', input: {}, jobId });

    await fixture.frogbot.jobs.cancelByID({ id: first.id });

    const second = await fixture.frogbot.jobs.queue({ task: 'record-effect', input: {}, jobId });
    const rows = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      pagination: false,
    });

    expect(second.id).not.toBe(first.id);
    expect(rows.docs).toHaveLength(2);
    expect(rows.docs.find(({ id }) => id === first.id)).toMatchObject({ hasError: true });
    expect(second).toMatchObject({ jobId, hasError: false });
  });

  it('concurrency supersedes replaces a pending holder with the same jobId', async () => {
    const jobId = randomUUID();
    const first = await fixture.frogbot.jobs.queue({
      workflow: 'supersede',
      input: { key: jobId, value: 'first' },
      jobId,
    });

    const second = await fixture.frogbot.jobs.queue({
      workflow: 'supersede',
      input: { key: jobId, value: 'second' },
      jobId,
    });

    const rows = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      pagination: false,
    });

    expect(second.input).toEqual({ key: jobId, value: 'second' });
    expect(rows.docs).toHaveLength(1);
    expect(rows.docs[0]).toMatchObject({ id: second.id, jobId });
    expect(rows.docs[0].input).not.toEqual(first.input);
  });

  it('concurrency supersedes replaces an older pending job without a jobId', async () => {
    const key = randomUUID();

    await fixture.frogbot.jobs.queue({ workflow: 'supersede', input: { key, value: 'first' } });

    const second = await fixture.frogbot.jobs.queue({
      workflow: 'supersede',
      input: { key, value: 'second' },
    });

    const rows = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      pagination: false,
    });

    expect(rows.docs).toHaveLength(1);
    expect(rows.docs[0]).toMatchObject({ id: second.id, input: { key, value: 'second' } });
  });

  it('a processing holder is returned rather than superseded', async () => {
    const jobId = randomUUID();
    const first = await fixture.frogbot.jobs.queue({
      workflow: 'supersede',
      input: { key: jobId, value: 'first' },
      jobId,
    });

    await fixture.payload.db.updateOne({
      collection: 'payload-jobs',
      id: first.id,
      data: { processing: true },
    });

    const duplicate = await fixture.frogbot.jobs.queue({
      workflow: 'supersede',
      input: { key: jobId, value: 'ignored' },
      jobId,
    });

    const rows = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      pagination: false,
    });

    expect(duplicate).toMatchObject({ id: first.id, input: first.input, processing: true });
    expect(rows.docs).toHaveLength(1);
  });

  it('calls without jobId create independent jobs', async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        fixture.frogbot.jobs.queue({ task: 'record-effect', input: {} }),
      ),
    );

    const rows = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      pagination: false,
    });

    expect(new Set(results.map(({ id }) => id)).size).toBe(4);
    expect(results).toEqual(
      Array.from({ length: 4 }, () => expect.not.objectContaining({ jobId: expect.anything() })),
    );
    expect(rows.docs).toHaveLength(4);
  });
});

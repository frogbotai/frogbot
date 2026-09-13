import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import type { MongooseAdapter } from '@payloadcms/db-mongodb';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { mongooseAdapter } from '../../../../packages/db-mongodb/src/index.js';
import { resolveJobsConfig } from '../../../../packages/frogbot/src/jobs/config.js';
import type { JobLeaseDatabase } from '../../../../packages/frogbot/src/jobs/lease.js';
import {
  getJobLeaseContext,
  jobLeaseOperations,
  renewJobLease,
  resetJobLease,
  withJobLease,
} from '../../../../packages/frogbot/src/jobs/lease.js';
import { installJobsRuntime } from '../../../../packages/frogbot/src/jobs/runtime.js';

vi.mock('frogbot/jobs', () => import('../../../../packages/frogbot/src/exports/jobs.js'));

const require = createRequire(
  new URL('../../../../packages/db-mongodb/package.json', import.meta.url),
);

const upstreamRequire = createRequire(require.resolve('@payloadcms/db-mongodb'));

const { buildConfig, BasePayload } = await import(upstreamRequire.resolve('payload'));

const mongoURL = process.env.TICKET121_MONGO_URL;

describe.skipIf(!mongoURL)('Mongo job claims and lease CAS', () => {
  let payload: MongooseAdapter['payload'];
  let adapter: MongooseAdapter;
  let Model: MongooseAdapter['collections'][string];
  let jobs: ReturnType<typeof installJobsRuntime>;

  const executions: (number | string)[] = [];

  beforeAll(async () => {
    payload = new BasePayload();

    await payload.init({
      config: await buildConfig({
        secret: 'ticket121-mongo-tests',
        db: mongooseAdapter({
          url: mongoURL!,
          connectOptions: { dbName: `ticket121-mongo-${randomUUID()}` },
          ensureIndexes: true,
        }),
        admin: { disable: true },
        collections: [],
        typescript: { autoGenerate: false },
        jobs: resolveJobsConfig({
          deleteJobOnComplete: false,
          tasks: [
            {
              slug: 'noop',
              handler: async ({ job }) => {
                executions.push(job.id);

                return { output: {} };
              },
            },
          ],
          jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
            ...defaultJobsCollection,
            defaultSort: 'priority',
            fields: [
              ...defaultJobsCollection.fields,
              { name: 'priority', type: 'number' },
              { name: 'lane', type: 'text' },
            ],
          }),
        }),
      }),
      disableOnInit: true,
    });

    adapter = payload.db as MongooseAdapter;
    Model = adapter.collections['payload-jobs'];

    jobs = installJobsRuntime({ payload, leaseDuration: 300_000 });
  }, 30_000);

  beforeEach(async () => {
    executions.length = 0;

    await Model.deleteMany({});
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    if (adapter?.connection) await adapter.connection.dropDatabase();

    await payload?.destroy();
  });

  async function seed(data: Record<string, unknown> = {}) {
    const doc = await Model.create({
      taskSlug: 'noop',
      queue: 'work',
      processing: false,
      hasError: false,
      priority: 1,
      lane: 'ready',
      input: { message: 'retained' },
      ...data,
    });

    return doc._id.toString() as string;
  }

  async function claim(args: Partial<Parameters<MongooseAdapter['updateJobs']>[0]> = {}) {
    return withJobLease({
      payload,
      leaseDuration: 300_000,
      run: async () => {
        const rows = await adapter.updateJobs({
          where: { queue: { equals: 'work' } },
          data: { processing: true },
          ...args,
        } as Parameters<MongooseAdapter['updateJobs']>[0]);

        const context = getJobLeaseContext()!;

        return { rows, owner: context.owner, ids: [...context.ids] };
      },
    });
  }

  async function read(id: string) {
    return Model.findById(id).lean();
  }

  it('installs atomic lease operations during descriptor init', () => {
    expect(adapter.packageName).toBe('@frogbotai/db-mongodb');
    expect((adapter as JobLeaseDatabase)[jobLeaseOperations]?.update).toBeTypeOf('function');
  });

  it('partitions overlapping candidate snapshots without returning duplicate claims', async () => {
    const ids = await Promise.all(Array.from({ length: 12 }, (_, priority) => seed({ priority })));

    const find = adapter.find.bind(adapter);

    let arrived = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });

    const snapshot = vi.spyOn(adapter, 'find').mockImplementation(async (args) => {
      const result = await find(args);

      if (++arrived === 2) release();

      await barrier;

      return result;
    });

    const batches = await Promise.all([claim({ limit: 12 }), claim({ limit: 12 })]);

    snapshot.mockRestore();

    const returned = batches.flatMap(({ rows }) => rows!.map(({ id }) => id));

    expect(returned).toHaveLength(12);
    expect(new Set(returned)).toEqual(new Set(ids));
    expect(batches[0].owner).not.toBe(batches[1].owner);

    for (const batch of batches) {
      expect(batch.ids).toEqual(batch.rows!.map(({ id }) => id));

      for (const id of batch.ids) {
        expect(await read(String(id))).toMatchObject({
          processing: true,
          leaseOwner: batch.owner,
          leaseUntil: expect.any(Date),
        });
      }
    }
  });

  it('rechecks the entire eligibility filter after candidate selection', async () => {
    const changed = await seed({ priority: 1 });

    const eligible = await seed({ priority: 2 });

    await seed({ lane: 'blocked' });

    await seed({ queue: 'other' });

    await seed({ hasError: true });

    await seed({ waitUntil: new Date(Date.now() + 60_000) });

    const find = adapter.find.bind(adapter);

    vi.spyOn(adapter, 'find').mockImplementationOnce(async (args) => {
      const result = await find(args);

      await Model.updateOne({ _id: changed }, { $set: { lane: 'blocked' } });

      return result;
    });

    const result = await claim({
      limit: 10,
      where: {
        and: [
          { queue: { equals: 'work' } },
          { hasError: { equals: false } },
          { lane: { not_in: ['blocked'] } },
          {
            or: [
              { waitUntil: { exists: false } },
              { waitUntil: { less_than: new Date().toISOString() } },
            ],
          },
        ],
      },
    });

    expect(result.ids).toEqual([eligible]);
    expect(await read(changed)).toMatchObject({ processing: false });
  });

  it('keeps sort, limit, default order, and sanitized output', async () => {
    const first = await seed({ priority: 1, createdAt: new Date('2026-01-01') });

    const second = await seed({ priority: 2, createdAt: new Date('2026-01-02') });

    const third = await seed({ priority: 3, createdAt: new Date('2026-01-03') });

    const descending = await claim({ limit: 2, sort: '-priority' });

    const remaining = await claim({ limit: 1 });

    expect(descending.ids).toEqual([third, second]);
    expect(remaining.ids).toEqual([first]);
    expect(descending.rows![0]).toMatchObject({
      id: third,
      input: { message: 'retained' },
      createdAt: '2026-01-03T00:00:00.000Z',
      leaseUntil: expect.any(String),
    });

    expect(descending.rows![0]).not.toHaveProperty('_id');
    expect(descending.rows![0]).not.toHaveProperty('__v');
  });

  it.each([0, undefined])('treats limit %s as unlimited', async (limit) => {
    const ids = await Promise.all([
      seed({ priority: 2 }),
      seed({ priority: 1 }),
      seed({ priority: 3 }),
    ]);

    const result = await claim({ limit });

    expect(result.ids).toEqual([ids[1], ids[0], ids[2]]);
  });

  it('atomically claims a single ID and records it when returning is disabled', async () => {
    const id = await seed();

    const results = await Promise.all([
      claim({ id, returning: false }),
      claim({ id, returning: false }),
    ]);

    expect(results.map(({ rows }) => rows)).toEqual([null, null]);
    expect(results.flatMap(({ ids }) => ids)).toEqual([id]);
    expect(await read(id)).toMatchObject({
      leaseOwner: results.find(({ ids }) => ids.length)!.owner,
    });
  });

  it('retains existing logs and applies native update operators during a claim', async () => {
    const log = {
      taskSlug: 'noop',
      taskID: 'previous',
      executedAt: new Date('2026-01-01'),
      completedAt: new Date('2026-01-01'),
      state: 'succeeded',
      error: {},
    };

    const id = await seed({ totalTried: 3, log: [log] });

    const result = await claim({
      id,
      data: { processing: true, totalTried: { $inc: 2 }, log: [] },
    });

    expect(result.rows![0]).toMatchObject({ totalTried: 5, input: { message: 'retained' } });
    expect(result.rows![0].log).toHaveLength(1);
    expect(result.rows![0].log![0]).toMatchObject({ taskID: 'previous' });

    await adapter.updateJobs({ id, data: { processing: false } });

    const appended = await claim({
      id,
      data: { processing: true, log: { $push: { ...log, taskID: 'next' } } },
    });

    expect(appended.rows![0].log!.map(({ taskID }) => taskID)).toEqual(['previous', 'next']);
  });

  it('records successful claims even if a later claim fails', async () => {
    const first = await seed({ priority: 1 });

    const second = await seed({ priority: 2 });

    const update = Model.findOneAndUpdate.bind(Model);

    vi.spyOn(Model, 'findOneAndUpdate')
      .mockImplementationOnce((...args) => update(...args))
      .mockImplementationOnce(() => {
        throw new Error('claim interrupted');
      });

    await withJobLease({
      payload,
      leaseDuration: 300_000,
      run: async () => {
        await expect(
          adapter.updateJobs({
            data: { processing: true },
            where: { queue: { equals: 'work' } },
            limit: 2,
          }),
        ).rejects.toThrow('claim interrupted');

        expect([...getJobLeaseContext()!.ids]).toEqual([first]);
      },
    });

    expect(await read(first)).toMatchObject({ processing: true });
    expect(await read(second)).toMatchObject({ processing: false });
  });

  it('delegates ordinary updates without a lease context', async () => {
    const id = await seed({ processing: true, totalTried: 1 });

    const rows = await adapter.updateJobs({
      id,
      data: { processing: false, totalTried: { $inc: 1 } },
    });

    expect(rows![0]).toMatchObject({ id, processing: false, totalTried: 2 });
  });

  it('rejects absent and mismatched runtime contexts before writing', async () => {
    const id = await seed();

    await expect(adapter.updateJobs({ id, data: { processing: true } })).rejects.toThrow(
      'this runtime',
    );

    await expect(
      withJobLease({
        payload,
        leaseDuration: 300_000,
        run: async () => {
          getJobLeaseContext()!.payload = {} as typeof payload;

          await adapter.updateJobs({ id, data: { processing: true } });
        },
      }),
    ).rejects.toThrow('this runtime');

    expect(await read(id)).toMatchObject({ processing: false });
  });

  it('renews only matching owners with unexpired incomplete claims', async () => {
    const future = new Date(Date.now() + 60_000);
    const expired = new Date(Date.now() - 60_000);

    const active = await seed({ processing: true, leaseOwner: 'owner', leaseUntil: future });

    const successor = await seed({ processing: true, leaseOwner: 'successor', leaseUntil: future });

    const stale = await seed({ processing: true, leaseOwner: 'owner', leaseUntil: expired });

    const done = await seed({
      processing: true,
      leaseOwner: 'owner',
      leaseUntil: future,
      completedAt: new Date(),
    });

    const idle = await seed({ processing: false, leaseOwner: 'owner', leaseUntil: future });

    const req = { payload } as Parameters<typeof renewJobLease>[0]['req'];

    await renewJobLease({ ids: [active, successor, stale, done, idle], owner: 'owner', req });

    expect((await read(active))!.leaseUntil.getTime()).toBeGreaterThan(future.getTime());

    for (const id of [successor, done, idle]) {
      expect((await read(id))!.leaseUntil).toEqual(future);
    }

    expect((await read(stale))!.leaseUntil).toEqual(expired);
  });

  it('keeps sweep CAS conditional when the owner or observed expiry changes', async () => {
    const expired = new Date(Date.now() - 60_000).toISOString();
    const newerExpired = new Date(Date.now() - 30_000).toISOString();

    const id = await seed({ processing: true, leaseOwner: 'owner', leaseUntil: expired });

    const req = { payload } as Parameters<typeof resetJobLease>[0]['req'];

    const updateMany = Model.updateMany.bind(Model);

    vi.spyOn(Model, 'updateMany').mockImplementationOnce(
      (...args) =>
        (async () => {
          await Model.updateOne({ _id: id }, { $set: { leaseUntil: newerExpired } });

          return updateMany(...args);
        })() as unknown as ReturnType<typeof Model.updateMany>,
    );

    await resetJobLease({ id, owner: 'owner', leaseUntil: expired, req });

    expect(await read(id)).toMatchObject({ processing: true, leaseUntil: new Date(newerExpired) });

    await Model.updateOne({ _id: id }, { $set: { leaseOwner: 'successor' } });

    await resetJobLease({ id, owner: 'owner', leaseUntil: newerExpired, req });

    expect(await read(id)).toMatchObject({ processing: true, leaseOwner: 'successor' });

    await resetJobLease({ id, owner: 'successor', leaseUntil: newerExpired, req });

    expect(await read(id)).toMatchObject({ processing: false, leaseOwner: null, leaseUntil: null });

    expect((await claim({ id })).ids).toEqual([id]);
  });

  it('uses request transactions for claim and lease writes', async () => {
    const id = await seed();

    const transactionID = await adapter.beginTransaction();

    expect(transactionID).toBeTruthy();

    await claim({ id, req: { transactionID: Promise.resolve(transactionID!) } });

    expect(await read(id)).toMatchObject({ processing: false });

    await adapter.rollbackTransaction(transactionID!);

    expect(await read(id)).toMatchObject({ processing: false });

    const claimed = await claim({ id });

    const originalExpiry = (await read(id))!.leaseUntil;

    const leaseTransaction = await adapter.beginTransaction();

    await renewJobLease({
      ids: [id],
      owner: claimed.owner,
      leaseDuration: 600_000,
      req: { payload, transactionID: Promise.resolve(leaseTransaction!) } as Parameters<
        typeof renewJobLease
      >[0]['req'],
    });

    await adapter.rollbackTransaction(leaseTransaction!);

    expect((await read(id))!.leaseUntil).toEqual(originalExpiry);
  });

  it('discards ended transaction sessions before claiming', async () => {
    const id = await seed();

    const transactionID = (await adapter.beginTransaction())!;
    const session = adapter.sessions[transactionID];

    await adapter.rollbackTransaction(transactionID);

    adapter.sessions[transactionID] = session;

    expect((await claim({ id, req: { transactionID } })).ids).toEqual([id]);
    expect(adapter.sessions[transactionID]).toBeUndefined();
  });

  it('uses the generated optional unique jobId field for concurrent create and deletion reuse', async () => {
    const results = await Promise.allSettled([
      seed({ jobId: 'stable' }),
      seed({ jobId: 'stable' }),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);

    await Promise.all([seed(), seed()]);

    await Model.deleteOne({ jobId: 'stable' });

    await expect(seed({ jobId: 'stable' })).resolves.toBeTypeOf('string');
  });

  it('runs native queue, batch, and runByID through default atomic lease claims', async () => {
    const single = await jobs.queue({
      task: 'noop',
      jobId: 'single',
      queue: 'work',
      input: {},
    });

    const batch = await jobs.queue({ task: 'noop', jobId: 'batch', queue: 'work', input: {} });

    await jobs.runByID({ id: single.id });
    await jobs.run({ queue: 'work', limit: 1 });

    expect(executions).toEqual([single.id, batch.id]);

    for (const id of executions) {
      expect(await read(String(id))).toMatchObject({
        processing: false,
        completedAt: expect.any(Date),
        leaseOwner: expect.any(String),
        leaseUntil: expect.any(Date),
      });
    }
  });
});

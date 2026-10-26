import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import type { MongooseAdapter } from '@payloadcms/db-mongodb';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { mongooseAdapter } from '../../../packages/db-mongodb/src/index.js';
import { resolveJobsConfig } from '../../../packages/frogbot/src/jobs/config.js';
import { installJobsRuntime } from '../../../packages/frogbot/src/jobs/runtime.js';

vi.mock('frogbot/jobs', () => import('../../../packages/frogbot/src/exports/jobs.js'));

const require = createRequire(
  new URL('../../../packages/db-mongodb/package.json', import.meta.url),
);

const upstreamRequire = createRequire(require.resolve('@payloadcms/db-mongodb'));

const { buildConfig, BasePayload, createPayloadRequest } = await import(
  upstreamRequire.resolve('payload')
);

const mongoURL = process.env.TICKET121_MONGO_URL;

describe.skipIf(!mongoURL)('Mongo job claims', () => {
  let payload: MongooseAdapter['payload'];
  let adapter: MongooseAdapter;
  let Model: MongooseAdapter['collections'][string];
  let jobs: ReturnType<typeof installJobsRuntime>;

  const executions: (number | string)[] = [];

  const transactionIDs: (number | string)[] = [];

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
              handler: ({ job }) => {
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

    jobs = installJobsRuntime({ payload });
  }, 30_000);

  beforeEach(async () => {
    executions.length = 0;

    await Model.deleteMany({});
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    await Promise.all(
      transactionIDs.splice(0).map((transactionID) => adapter.rollbackTransaction(transactionID)),
    );
  });

  afterAll(async () => {
    if (adapter?.connection) await adapter.connection.dropDatabase();

    await payload?.destroy();
  });

  async function seed(data: Record<string, unknown> = {}) {
    const doc = await Model.create({
      taskSlug: 'noop',
      queue: 'work',
      hasError: false,
      priority: 1,
      lane: 'ready',
      input: { message: 'retained' },
      ...data,
    });

    return doc._id.toString() as string;
  }

  const lease = () => ({
    processingToken: randomUUID(),
    processingUntil: new Date(Date.now() + 300_000).toISOString(),
  });

  async function claim(args: Partial<Parameters<MongooseAdapter['updateJobs']>[0]> = {}) {
    const data = args.data ?? lease();
    const rows = await adapter.updateJobs({
      where: { queue: { equals: 'work' } },
      ...args,
      data,
    });

    const claimed = await Model.find({ processingToken: data.processingToken })
      .sort({ _id: 1 })
      .lean();

    return {
      rows,
      token: data.processingToken as string,
      ids: (rows ?? claimed).map((row: { id?: string; _id?: unknown }) =>
        String(row.id ?? row._id),
      ),
    };
  }

  function read(id: string) {
    return Model.findById(id).lean();
  }

  it('names the FrogBot package', () => {
    expect(adapter.packageName).toBe('@frogbotai/db-mongodb');
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

    for (const batch of batches) {
      for (const { id } of batch.rows!) {
        expect(await read(String(id))).toMatchObject({
          processingToken: batch.token,
          processingUntil: expect.any(Date),
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
    expect((await read(changed))!.processingToken ?? null).toBeNull();
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
      processingUntil: expect.any(String),
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

  it('atomically claims a single ID when returning is disabled', async () => {
    const id = await seed();

    const results = await Promise.all([
      claim({ id, returning: false }),
      claim({ id, returning: false }),
    ]);

    expect(results.map(({ rows }) => rows)).toEqual([null, null]);
    expect(results.flatMap(({ ids }) => ids)).toEqual([id]);
    expect(await read(id)).toMatchObject({
      processingToken: results.find(({ ids }) => ids.length)!.token,
    });
  });

  it('skips a live lease and reclaims an expired one', async () => {
    const live = await seed({
      processingToken: 'other',
      processingUntil: new Date(Date.now() + 60_000),
    });

    const expired = await seed({
      processingToken: 'crashed',
      processingUntil: new Date(Date.now() - 60_000),
    });

    const result = await claim({ limit: 10 });

    expect(result.ids).toEqual([expired]);
    expect(await read(live)).toMatchObject({ processingToken: 'other' });
  });

  it('yields a claim whose key another token holds with a live lease', async () => {
    await seed({
      priority: 0,
      concurrencyKey: 'shared',
      processingToken: 'other',
      processingUntil: new Date(Date.now() + 60_000),
    });

    const waiting = await seed({ priority: 1, concurrencyKey: 'shared', totalTried: 1 });
    const free = await seed({ priority: 2, concurrencyKey: 'free' });
    const result = await claim({ limit: 10 });

    expect(result.rows!.map(({ id }) => id)).toEqual([free]);
    expect(result.ids).toEqual([free]);
    expect(await read(waiting)).toMatchObject({ processingUntil: null, totalTried: 1 });
  });

  it('makes no extra find when no claimed row has a key', async () => {
    await seed({ priority: 1 });
    await seed({ priority: 2 });

    const find = vi.spyOn(adapter, 'find');

    expect((await claim({ limit: 10 })).ids).toHaveLength(2);
    expect(find).toHaveBeenCalledOnce();
  });

  it('delegates ordinary updates, including native operators', async () => {
    const id = await seed({ totalTried: 1 });

    const rows = await adapter.updateJobs({ id, data: { totalTried: { $inc: 1 } } });

    expect(rows![0]).toMatchObject({ id, totalTried: 2 });
  });

  it('claims inside the request transaction', async () => {
    const id = await seed();

    const transactionID = await adapter.beginTransaction();

    expect(transactionID).toBeTruthy();

    await claim({ id, req: { transactionID: Promise.resolve(transactionID) } });

    expect((await read(id))!.processingToken ?? null).toBeNull();

    await adapter.rollbackTransaction(transactionID);

    expect((await read(id))!.processingToken ?? null).toBeNull();
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

  it('concurrent creates reserve a live jobId once', async () => {
    const results = await Promise.allSettled([
      seed({ jobId: 'stable', completedAt: null }),
      seed({ jobId: 'stable', completedAt: null }),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
  });

  it('terminal failure frees the jobId for a new live row', async () => {
    await seed({ jobId: 'stable', completedAt: null });

    await Model.updateOne({ jobId: 'stable' }, { $set: { hasError: true } });

    const afterFailure = await seed({ jobId: 'stable', completedAt: null });

    expect(await read(afterFailure)).toMatchObject({ jobId: 'stable', hasError: false });
  });

  it('completion frees the jobId for a new live row', async () => {
    const first = await seed({ jobId: 'stable', completedAt: null });

    await Model.updateOne({ _id: first }, { $set: { completedAt: new Date() } });

    const afterCompletion = await seed({ jobId: 'stable', completedAt: null });

    expect(await read(afterCompletion)).toMatchObject({ jobId: 'stable', completedAt: null });
  });

  it('deletion frees the jobId for a new live row', async () => {
    const first = await seed({ jobId: 'stable', completedAt: null });

    await Model.deleteOne({ _id: first });

    await expect(seed({ jobId: 'stable', completedAt: null })).resolves.toBeTypeOf('string');
  });

  it('creates only the live jobId index and repeats safely on connect', async () => {
    const indexes = await Model.collection.listIndexes().toArray();

    const jobIdIndexes = indexes.filter(({ key }) => 'jobId' in key);

    expect(jobIdIndexes).toHaveLength(1);
    expect(jobIdIndexes[0]).toMatchObject({
      name: 'frogbot_jobId_live',
      key: { jobId: 1 },
      unique: true,
      partialFilterExpression: {
        jobId: { $type: 'string' },
        completedAt: { $type: 'null' },
        hasError: false,
      },
    });

    await payload.db.connect();

    expect(await Model.collection.listIndexes().toArray()).toEqual(indexes);
  });

  it('a raw database insert stores completedAt null and reserves its jobId', async () => {
    const row = await payload.db.create({
      collection: 'payload-jobs',
      data: { taskSlug: 'noop', queue: 'work', jobId: 'raw-create' },
    });

    expect(await read(String(row.id))).toMatchObject({ completedAt: null });

    await expect(
      payload.db.create({
        collection: 'payload-jobs',
        data: { taskSlug: 'noop', queue: 'work', jobId: 'raw-create' },
      }),
    ).rejects.toThrow();
  });

  it('a racing insert in an uncommitted transaction surfaces MongoDB’s error unchanged', async () => {
    const jobId = randomUUID();

    const winnerTransaction = (await adapter.beginTransaction())!;

    transactionIDs.push(winnerTransaction);

    const loserTransaction = (await adapter.beginTransaction())!;

    transactionIDs.push(loserTransaction);

    const winnerReq = await createPayloadRequest({
      payload: payload,
      req: { transactionID: winnerTransaction },
    });

    const loserReq = await createPayloadRequest({
      payload: payload,
      req: { transactionID: loserTransaction },
    });

    const winner = await jobs.queue({
      task: 'noop',
      jobId,
      queue: 'work',
      input: {},
      req: winnerReq,
    });

    expect(await Model.countDocuments({ jobId })).toBe(0);
    expect(adapter.sessions[winnerTransaction].inTransaction()).toBe(true);

    const lookup = vi.spyOn(adapter, 'find');
    const create = Model.create.bind(Model);

    let originalError: unknown;
    let lookupsAtFailure = 0;

    const insert = vi.spyOn(Model, 'create').mockImplementationOnce((...args) =>
      create(...args).catch((error: unknown) => {
        originalError = error;
        lookupsAtFailure = lookup.mock.calls.length;

        throw error;
      }),
    );

    const loser = jobs.queue({
      task: 'noop',
      jobId,
      queue: 'work',
      input: {},
      req: loserReq,
    });

    await expect(loser).rejects.toMatchObject({
      name: 'MongoServerError',
      code: 112,
      codeName: 'WriteConflict',
      errorLabels: expect.arrayContaining(['TransientTransactionError']),
    });

    await expect(loser).rejects.toBe(originalError);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(lookupsAtFailure).toBe(1);
    expect(lookup).toHaveBeenCalledTimes(lookupsAtFailure);

    await adapter.commitTransaction(winnerTransaction);

    const rows = await Model.find({ jobId }).lean();

    expect(rows).toHaveLength(1);
    expect(rows[0]._id.toString()).toBe(winner.id);
    expect(rows[0]).toMatchObject({ jobId, completedAt: null, hasError: false });
  });

  it('runs native queue, batch, and runByID through atomic claims', async () => {
    const single = await jobs.queue({
      task: 'noop',
      jobId: 'single',
      queue: 'work',
      input: {},
      overrideAccess: true,
    });

    const batch = await jobs.queue({
      task: 'noop',
      jobId: 'batch',
      queue: 'work',
      input: {},
      overrideAccess: true,
    });

    await jobs.runByID({ id: single.id, overrideAccess: true });
    await jobs.run({ queue: 'work', limit: 1, overrideAccess: true });

    expect(executions).toEqual([single.id, batch.id]);

    for (const id of executions) {
      expect(await read(String(id))).toMatchObject({
        completedAt: expect.any(Date),
        processingUntil: null,
      });
    }
  });
});

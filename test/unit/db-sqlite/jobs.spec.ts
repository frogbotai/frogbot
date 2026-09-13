import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Job, Payload, PayloadRequest, UpdateJobsArgs, Where } from 'payload';
import { BasePayload, buildConfig, createLocalReq } from 'payload';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { sqliteAdapter } from '../../../packages/db-sqlite/src/index.js';
import { resolveJobsConfig } from '../../../packages/frogbot/src/jobs/config.js';
import {
  getJobLeaseContext,
  type JobLeaseDatabase,
  jobLeaseOperations,
  renewJobLease,
  resetJobLease,
  withJobLease,
} from '../../../packages/frogbot/src/jobs/lease.js';

vi.mock('frogbot/jobs', () => import('../../../packages/frogbot/src/exports/jobs.js'));

const payload = new BasePayload();

const statements: string[] = [];
const directory = mkdtempSync(join(tmpdir(), 'frogbot-sql-jobs-'));
const descriptor = sqliteAdapter({
  client: { url: `file:${join(directory, 'jobs.db')}` },
  transactionOptions: {},
  logger: { logQuery: (query) => statements.push(query) },
});

let database: ReturnType<typeof descriptor.init>;
let req: PayloadRequest;

async function create(data: Record<string, unknown> = {}) {
  return database.create<Job>({
    collection: 'payload-jobs',
    data: {
      taskSlug: 'work',
      queue: 'default',
      processing: false,
      hasError: false,
      createdAt: '2026-09-13T00:00:00.000Z',
      updatedAt: '2026-09-13T00:00:00.000Z',
      ...data,
    },
  });
}

function claim(args: Partial<UpdateJobsArgs> = {}) {
  return withJobLease({
    payload,
    req,
    leaseDuration: 300_000,
    run: async () => {
      const jobs = await database.updateJobs({
        data: { processing: true },
        where: {},
        sort: 'id',
        limit: 10,
        ...args,
      } as UpdateJobsArgs);

      return { jobs, context: getJobLeaseContext()! };
    },
  });
}

beforeAll(async () => {
  payload.logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Payload['logger'];

  payload.config = await buildConfig({
    secret: 'sql-jobs-test',
    db: descriptor,
    collections: [{ slug: 'groups', fields: [{ name: 'title', type: 'text' }] }],
    jobs: resolveJobsConfig({
      tasks: [{ slug: 'work', handler: async () => ({ output: {} }) }],
      enableConcurrencyControl: true,
      jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
        ...defaultJobsCollection,
        dbName: 'custom_jobs',
        fields: [
          ...defaultJobsCollection.fields,
          { name: 'priority', type: 'number' },
          { name: 'firstGroup', type: 'relationship', relationTo: 'groups' },
          { name: 'secondGroup', type: 'relationship', relationTo: 'groups' },
        ],
      }),
    }),
  });

  payload.collections = Object.fromEntries(
    payload.config.collections.map((config) => [config.slug, { config }]),
  ) as Payload['collections'];

  database = descriptor.init({ payload });
  payload.db = database;

  await database.init();
  await database.connect();

  req = await createLocalReq({}, payload);
}, 30_000);

beforeEach(async () => {
  await database.deleteMany({ collection: 'payload-jobs', where: {} });

  statements.length = 0;
});

afterAll(() => {
  database?.client?.close();

  rmSync(directory, { recursive: true, force: true });
});

describe('SQLite atomic jobs', () => {
  it('partitions concurrent claims and records only the winning IDs', async () => {
    for (let i = 0; i < 12; i++) await create();

    statements.length = 0;

    const results = await Promise.all([claim({ limit: 6 }), claim({ limit: 6 })]);

    const ids = results.flatMap(({ jobs }) => jobs!.map((job) => job.id));

    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
    expect(results[0].context.owner).not.toBe(results[1].context.owner);

    for (const { jobs, context } of results) {
      expect(context.ids).toEqual(new Set(jobs!.map((job) => job.id)));

      for (const job of jobs!) {
        expect(job).toMatchObject({ processing: true, leaseOwner: context.owner });
        expect(
          new Date((job as Job & { leaseUntil: string }).leaseUntil).getTime(),
        ).toBeGreaterThan(Date.now());
      }
    }

    const updates = statements.filter((statement) => statement.startsWith('update'));

    expect(updates).toHaveLength(2);
    expect(
      updates.every(
        (statement) => statement.includes(' in (select ') && statement.includes('returning'),
      ),
    ).toBe(true);
    expect(statements[0]).toMatch(/^update "custom_jobs"/);
  });

  it('preserves nested eligibility predicates, queue exclusions, sort and limit', async () => {
    const first = await create({ priority: 10, concurrencyKey: 'available' });
    const second = await create({ priority: 20 });

    await create({ priority: 99, queue: 'other' });
    await create({ priority: 99, concurrencyKey: 'busy' });
    await create({ priority: 99, waitUntil: '2099-01-01T00:00:00.000Z' });
    await create({ priority: 99, completedAt: '2026-09-13T00:00:00.000Z' });
    await create({ priority: 99, hasError: true });

    const where: Where = {
      and: [
        { queue: { equals: 'default' } },
        { completedAt: { exists: false } },
        { hasError: { not_equals: true } },
        {
          or: [
            { waitUntil: { exists: false } },
            { waitUntil: { less_than: new Date().toISOString() } },
          ],
        },
        { or: [{ concurrencyKey: { exists: false } }, { concurrencyKey: { not_in: ['busy'] } }] },
      ],
    };

    const top = await claim({ where, sort: '-priority', limit: 1 });
    const rest = await claim({ where, sort: '-priority', limit: 0 });

    expect(top.jobs!.map(({ id }) => id)).toEqual([second.id]);
    expect(rest.jobs!.map(({ id }) => id)).toEqual([first.id]);
  });

  it('returns native JSON, dates and relational log entries after claiming', async () => {
    const queued = await create({
      input: { nested: ['kept'] },
      priority: 4,
      log: [
        {
          id: 'log-1',
          taskID: 'prior',
          taskSlug: 'work',
          state: 'succeeded',
          executedAt: '2026-09-13T00:00:00.000Z',
          completedAt: '2026-09-13T00:00:00.000Z',
          output: { preserved: true },
        },
      ],
    });

    const { jobs } = await claim({ id: queued.id });

    expect(jobs![0]).toMatchObject({
      id: queued.id,
      input: { nested: ['kept'] },
      priority: 4,
      processing: true,
      createdAt: '2026-09-13T00:00:00.000Z',
      log: [{ taskID: 'prior', state: 'succeeded', output: { preserved: true } }],
    });
  });

  it('claims a single ID only once even without a caller processing predicate', async () => {
    const job = await create();

    const results = await Promise.all([claim({ id: job.id }), claim({ id: job.id })]);

    expect(results.flatMap(({ jobs }) => jobs!)).toHaveLength(1);
    expect(results.reduce((count, result) => count + result.context.ids.size, 0)).toBe(1);
  });

  it('records ownership with returning disabled and handles no eligible jobs', async () => {
    const job = await create();

    const result = await claim({ returning: false });
    const empty = await claim();

    expect(result.jobs).toBeNull();
    expect(result.context.ids).toEqual(new Set([job.id]));
    expect(empty.jobs).toEqual([]);
    expect(empty.context.ids.size).toBe(0);
  });

  it('delegates ordinary updates including log writes', async () => {
    const job = await create();

    const updated = await database.updateJobs({
      id: job.id,
      data: {
        processing: false,
        totalTried: 2,
        log: [
          {
            id: 'ordinary-log',
            taskID: 'work',
            taskSlug: 'work',
            state: 'succeeded',
            executedAt: '2026-09-13T00:00:00.000Z',
            completedAt: '2026-09-13T00:00:00.000Z',
          },
        ],
      },
    });

    expect(updated![0]).toMatchObject({
      id: job.id,
      processing: false,
      totalTried: 2,
      log: [{ id: 'ordinary-log', state: 'succeeded' }],
    });
  });

  it('rejects missing and cross-runtime ownership before writing', async () => {
    await create();

    statements.length = 0;

    await expect(database.updateJobs({ data: { processing: true }, where: {} })).rejects.toThrow(
      'this runtime',
    );

    const other = Object.assign(new BasePayload(), { config: payload.config, db: database });

    await expect(
      withJobLease({
        payload: other,
        leaseDuration: 300_000,
        run: () => database.updateJobs({ data: { processing: true }, where: {} }),
      }),
    ).rejects.toThrow('this runtime');

    expect(statements).toEqual([]);
  });

  it('renews and resets through conditional SQL while rejecting stale owners and observations', async () => {
    const past = '2020-01-01T00:00:00.000Z';
    const future = '2099-01-01T00:00:00.000Z';

    const active = await create({ processing: true, leaseOwner: 'active', leaseUntil: future });
    const expired = await create({ processing: true, leaseOwner: 'expired', leaseUntil: past });
    const completed = await create({
      processing: true,
      leaseOwner: 'active',
      leaseUntil: future,
      completedAt: past,
    });

    statements.length = 0;

    await renewJobLease({ ids: [active.id, expired.id, completed.id], owner: 'active', req });

    await resetJobLease({ id: active.id, owner: 'old-owner', leaseUntil: past, req });

    await resetJobLease({ id: active.id, owner: 'active', leaseUntil: past, req });

    await resetJobLease({ id: expired.id, owner: 'expired', leaseUntil: past, req });

    expect(statements).toHaveLength(4);
    expect(
      statements.every(
        (statement) => statement.startsWith('update') && statement.includes(' where '),
      ),
    ).toBe(true);

    const rows = await database.find({ collection: 'payload-jobs', pagination: false, sort: 'id' });

    expect(rows.docs[0]).toMatchObject({ processing: true, leaseOwner: 'active' });
    expect(rows.docs[0].leaseUntil).not.toBe(future);
    expect(rows.docs[1]).toMatchObject({ processing: false, leaseOwner: null, leaseUntil: null });
    expect(rows.docs[2]).toMatchObject({ leaseUntil: future, processing: true });
  });

  it('rejects lease mutations from a different runtime', async () => {
    await expect(
      (database as JobLeaseDatabase)[jobLeaseOperations]!.update({
        data: { leaseUntil: null },
        where: {},
        req: { ...req, payload: new BasePayload() },
      }),
    ).rejects.toThrow('this runtime');
  });

  it('deduplicates joined log matches before applying the limit and sorts by joined values', async () => {
    const log = (id: string, executedAt: string) => ({
      id,
      executedAt,
      completedAt: executedAt,
      taskID: id,
      taskSlug: 'work',
      state: 'succeeded',
    });

    const first = await create({
      log: [log('a', '2020-01-01T00:00:00.000Z'), log('b', '2020-01-02T00:00:00.000Z')],
    });

    const second = await create({ log: [log('c', '2021-01-01T00:00:00.000Z')] });

    await create();

    const result = await claim({
      where: { 'log.state': { equals: 'succeeded' } },
      sort: 'log.executedAt',
      limit: 2,
    });

    expect(result.jobs!.map(({ id }) => id)).toEqual([first.id, second.id]);
  });

  it('hydrates claims from their transaction and rolls back the lease with the claim', async () => {
    const job = await create();
    const transactionID = await database.beginTransaction();

    try {
      const result = await claim({ id: job.id, req: { transactionID } });

      expect(result.jobs![0]).toMatchObject({ id: job.id, processing: true });
    } finally {
      await database.rollbackTransaction(transactionID!);
    }

    const rows = await database.find({
      collection: 'payload-jobs',
      where: { id: { equals: job.id } },
    });

    expect(rows.docs[0]).toMatchObject({ processing: false, leaseOwner: null, leaseUntil: null });
  });

  it('preserves aliases when caller predicates join the same collection twice', async () => {
    const firstGroup = await database.create({ collection: 'groups', data: { title: 'first' } });
    const secondGroup = await database.create({ collection: 'groups', data: { title: 'second' } });

    const job = await create({ firstGroup: firstGroup.id, secondGroup: secondGroup.id });

    await create({ firstGroup: secondGroup.id, secondGroup: firstGroup.id });

    const result = await claim({
      where: {
        and: [
          { 'firstGroup.title': { equals: 'first' } },
          { 'secondGroup.title': { equals: 'second' } },
        ],
      },
    });

    expect(result.jobs!.map(({ id }) => id)).toEqual([job.id]);
  });
});

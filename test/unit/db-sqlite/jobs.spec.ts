import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Job, Payload, UpdateJobsArgs, Where } from 'payload';
import { BasePayload, buildConfig } from 'payload';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { sqliteAdapter } from '../../../packages/db-sqlite/src/index.js';
import { resolveJobsConfig } from '../../../packages/frogbot/src/jobs/config.js';

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

function create(data: Record<string, unknown> = {}) {
  return database.create({
    collection: 'payload-jobs',
    data: {
      taskSlug: 'work',
      queue: 'default',
      hasError: false,
      createdAt: '2026-09-13T00:00:00.000Z',
      updatedAt: '2026-09-13T00:00:00.000Z',
      ...data,
    },
  });
}

async function beginTransaction(): Promise<number | string> {
  const transactionID = await database.beginTransaction();

  if (transactionID === null) throw new Error('The SQLite adapter did not start a transaction.');

  return transactionID;
}

async function claim(args: Partial<UpdateJobsArgs> = {}) {
  const token = randomUUID();
  const jobs = await database.updateJobs({
    data: { processingToken: token, processingUntil: new Date(Date.now() + 300_000).toISOString() },
    where: {},
    sort: 'id',
    limit: 10,
    ...args,
  } as UpdateJobsArgs);

  return { jobs, token };
}

beforeAll(async () => {
  payload.logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Payload['logger'];

  payload.config = await buildConfig({
    secret: 'sql-jobs-test',
    db: descriptor,
    collections: [{ slug: 'groups', fields: [{ name: 'title', type: 'text' }] }],
    jobs: resolveJobsConfig({
      tasks: [{ slug: 'work', handler: () => ({ output: {} }) }],
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
  );

  database = descriptor.init({ payload });
  payload.db = database;

  if (!database.init || !database.connect) {
    throw new Error('The SQLite adapter must define init and connect.');
  }

  await database.init();
  await database.connect();
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
  it("partitions concurrent claims and returns only each claim's rows", async () => {
    for (let i = 0; i < 12; i++) await create();

    statements.length = 0;

    const results = await Promise.all([claim({ limit: 6 }), claim({ limit: 6 })]);

    const ids = results.flatMap(({ jobs }) => jobs!.map((job) => job.id));

    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);

    for (const { jobs, token } of results) {
      for (const job of jobs!) {
        expect(job).toMatchObject({ processingToken: token });
        expect(new Date(job.processingUntil!).getTime()).toBeGreaterThan(Date.now());
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
          input: {},
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
      processingToken: expect.any(String),
      createdAt: '2026-09-13T00:00:00.000Z',
      log: [{ taskID: 'prior', state: 'succeeded', output: { preserved: true } }],
    });
  });

  it('claims a single ID only once', async () => {
    const job = await create();

    const results = await Promise.all([claim({ id: job.id }), claim({ id: job.id })]);

    expect(results.flatMap(({ jobs }) => jobs!)).toHaveLength(1);
  });

  it('skips jobs held by a live lease and reclaims an expired one', async () => {
    const live = await create({
      processingToken: 'other',
      processingUntil: '2099-01-01T00:00:00.000Z',
    });

    const expired = await create({
      processingToken: 'crashed',
      processingUntil: '2020-01-01T00:00:00.000Z',
    });

    const { jobs, token } = await claim();

    expect(jobs!.map(({ id }) => id)).toEqual([expired.id]);
    expect(jobs![0].processingToken).toBe(token);

    const rows = await database.find<Job>({ collection: 'payload-jobs', sort: 'id' });

    expect(rows.docs.find(({ id }) => id === live.id)?.processingToken).toBe('other');
  });

  it('yields a claim whose key another token holds with a live lease', async () => {
    await create({
      concurrencyKey: 'shared',
      processingToken: 'other',
      processingUntil: '2099-01-01T00:00:00.000Z',
    });

    const waiting = await create({ concurrencyKey: 'shared', totalTried: 1 });
    const free = await create({ concurrencyKey: 'free' });
    const { jobs } = await claim();

    expect(jobs!.map(({ id }) => id)).toEqual([free.id]);

    const rows = await database.find<Job>({
      collection: 'payload-jobs',
      where: { id: { equals: waiting.id } },
    });

    expect(rows.docs[0]).toMatchObject({
      processingToken: null,
      processingUntil: null,
      totalTried: 1,
    });
  });

  it('makes no key check when no claimed row has a key', async () => {
    await create();
    await create();

    statements.length = 0;

    expect((await claim()).jobs).toHaveLength(2);
    expect(statements.some((statement) => statement.includes('"concurrency_key" in'))).toBe(false);

    await create({ concurrencyKey: 'keyed' });

    statements.length = 0;

    expect((await claim()).jobs).toHaveLength(1);
    expect(statements.some((statement) => statement.includes('"concurrency_key" in'))).toBe(true);
  });

  it('claims with returning disabled and handles no eligible jobs', async () => {
    await create();

    const result = await claim({ returning: false });
    const empty = await claim();

    expect(result.jobs).toBeNull();
    expect(empty.jobs).toEqual([]);
  });

  it('delegates ordinary updates including log writes', async () => {
    const job = await create();

    const updated = await database.updateJobs({
      id: job.id,
      data: {
        totalTried: 2,
        log: [
          {
            id: 'ordinary-log',
            taskID: 'work',
            taskSlug: 'work',
            input: {},
            state: 'succeeded',
            executedAt: '2026-09-13T00:00:00.000Z',
            completedAt: '2026-09-13T00:00:00.000Z',
          },
        ],
      },
    });

    expect(updated![0]).toMatchObject({
      id: job.id,
      totalTried: 2,
      log: [{ id: 'ordinary-log', state: 'succeeded' }],
    });
  });

  it('deduplicates joined log matches before applying the limit and sorts by joined values', async () => {
    const log = (id: string, executedAt: string) => ({
      id,
      executedAt,
      completedAt: executedAt,
      taskID: id,
      taskSlug: 'work',
      input: {},
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

  it('hydrates claims from their transaction and rolls back the claim with it', async () => {
    const job = await create();
    const transactionID = await beginTransaction();
    const result = await claim({ id: job.id, req: { transactionID } }).finally(() =>
      database.rollbackTransaction(transactionID),
    );

    expect(result.jobs![0]).toMatchObject({ id: job.id, processingToken: result.token });

    const rows = await database.find({
      collection: 'payload-jobs',
      where: { id: { equals: job.id } },
    });

    expect(rows.docs[0]).toMatchObject({ processingToken: null, processingUntil: null });
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

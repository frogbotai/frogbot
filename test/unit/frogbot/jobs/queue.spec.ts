import { describe, expect, it, vi } from 'vitest';

import {
  type JobInsertDatabase,
  jobInsertOperations,
} from '../../../../packages/frogbot/src/jobs/insert.js';
import { setup } from './helpers.js';

describe('jobs.queue', () => {
  it('retains native enqueue semantics with safe execution defaults', async () => {
    const { payload, req, database, install } = await setup({
      jobs: {
        enableConcurrencyControl: true,
        workflows: [
          {
            slug: 'sync',
            queue: 'syncs',
            concurrency: { key: () => 'user-42', supersedes: true },
            handler: async () => undefined,
          },
        ],
      },
    });

    const deleteMany = vi.mocked(database.deleteMany);

    const jobs = install();
    const waitUntil = new Date('2026-09-14T00:00:00.000Z');

    const result = await jobs.queue({
      workflow: 'sync',
      input: { user: 42 },
      jobId: 'sync-42',
      waitUntil,
      req,
    });

    expect(result).toMatchObject({
      id: 1,
      jobId: 'sync-42',
      queue: 'syncs',
      input: { user: 42 },
      workflowSlug: 'sync',
      concurrencyKey: 'user-42',
      waitUntil: waitUntil.toISOString(),
    });

    expect(deleteMany).toHaveBeenCalledOnce();
    expect(payload.config.jobs).toMatchObject({ runHooks: false, depth: 0 });
  });

  it('keeps concurrent job IDs isolated and leaves generated primary IDs alone', async () => {
    const { req, database, install } = await setup();

    let id = 0;

    database.create = vi.fn(async ({ data }) => {
      await Promise.resolve();

      return { ...data, id: ++id };
    }) as typeof database.create;

    const jobs = install();

    const results = await Promise.all([
      jobs.queue({ task: 'work', input: {}, jobId: 'a', req }),
      jobs.queue({ task: 'work', input: {}, jobId: 'b', req }),
      jobs.queue({ task: 'work', input: {}, req }),
    ]);

    expect(results.map((job) => job.id).sort()).toEqual([1, 2, 3]);

    expect(results.map((job) => (job as unknown as { jobId?: string }).jobId)).toEqual([
      'a',
      'b',
      undefined,
    ]);
  });

  it('preserves queue access rejection and native database errors', async () => {
    const { req, database, install } = await setup({ jobs: { access: { queue: () => false } } });

    const create = vi.mocked(database.create);

    const jobs = install();

    await expect(
      jobs.queue({ task: 'work', input: {}, jobId: 'denied', req, overrideAccess: false }),
    ).rejects.toMatchObject({ status: 403 });

    expect(create).not.toHaveBeenCalled();

    const duplicate = new Error('unique constraint');

    create.mockRejectedValue(duplicate);

    await expect(jobs.queue({ task: 'work', input: {}, jobId: 'duplicate', req })).rejects.toBe(
      duplicate,
    );

    expect(create).toHaveBeenCalledTimes(4);
    expect(database.find).toHaveBeenCalledTimes(5);
  });

  it('resolves a rejected insert with the live holder', async () => {
    const { req, database, install } = await setup();
    const holder = { id: 42, taskSlug: 'work', input: { original: true }, jobId: 'duplicate' };
    const create = vi.mocked(database.create);

    create.mockRejectedValue(new Error('unique constraint'));
    vi.mocked(database.find)
      .mockResolvedValueOnce({ docs: [] } as never)
      .mockResolvedValueOnce({ docs: [holder] } as never);

    const jobs = install();

    const result = await jobs.queue({ task: 'work', input: {}, jobId: 'duplicate', req });

    expect(result).toMatchObject(holder);
    expect(create).toHaveBeenCalledOnce();
    expect(database.find).toHaveBeenLastCalledWith({
      collection: 'payload-jobs',
      where: {
        and: [
          { jobId: { equals: 'duplicate' } },
          { completedAt: { exists: false } },
          { hasError: { not_equals: true } },
        ],
      },
      limit: 1,
      pagination: false,
      req,
    });
  });

  it('returns a live holder without inserting', async () => {
    const { req, database, install } = await setup();
    const holder = { id: 42, taskSlug: 'work', input: { original: true }, jobId: 'duplicate' };
    const create = vi.mocked(database.create);

    vi.mocked(database.find).mockResolvedValue({ docs: [holder] } as never);

    const result = await install().queue({ task: 'work', input: {}, jobId: 'duplicate', req });

    expect(result).toMatchObject(holder);
    expect(create).not.toHaveBeenCalled();
  });

  it('rethrows the original error inside a Mongo transaction without a lookup', async () => {
    const { req, database, install } = await setup();
    const error = new Error('WriteConflict');
    const create = vi.mocked(database.create);

    req.transactionID = Promise.resolve('transaction');
    database.sessions = { transaction: { inTransaction: () => true } } as never;
    create.mockRejectedValue(error);

    const jobs = install();

    await expect(jobs.queue({ task: 'work', input: {}, jobId: 'race', req })).rejects.toBe(error);

    expect(database.find).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
  });

  it('retries the insert when the holder finished between the conflict and the lookup', async () => {
    const { req, database, install } = await setup();
    const create = vi.mocked(database.create);

    create.mockRejectedValueOnce(new Error('unique constraint'));

    const result = await install().queue({ task: 'work', input: {}, jobId: 'race', req });

    expect(result).toMatchObject({ id: 1, jobId: 'race' });
    expect(create).toHaveBeenCalledTimes(2);
    expect(database.find).toHaveBeenCalledTimes(2);
  });

  it('inserts through the adapter operation with the caller request', async () => {
    const { req, database, install } = await setup();
    const insert = vi.fn(async ({ insert }) => insert());

    (database as JobInsertDatabase)[jobInsertOperations] = { insert };

    const result = await install().queue({ task: 'work', input: {}, jobId: 'new', req });

    expect(result).toMatchObject({ id: 1, jobId: 'new' });
    expect(insert).toHaveBeenCalledWith({ req, insert: expect.any(Function) });
  });
});

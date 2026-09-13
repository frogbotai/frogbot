import { describe, expect, it, vi } from 'vitest';

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

    expect(database.deleteMany).toHaveBeenCalledOnce();
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

    expect(results.map((job) => job.id)).toEqual([1, 2, 3]);

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

    create.mockRejectedValueOnce(duplicate);

    await expect(jobs.queue({ task: 'work', input: {}, jobId: 'duplicate', req })).rejects.toBe(
      duplicate,
    );
  });
});

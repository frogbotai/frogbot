import { drizzle as nodeDrizzle } from 'drizzle-orm/node-postgres';
import { drizzle as vercelDrizzle } from 'drizzle-orm/vercel-postgres';
import { BasePayload, buildConfig, type Payload } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { postgresAdapter } from '../../../packages/db-postgres/src/index.js';
import { vercelPostgresAdapter } from '../../../packages/db-vercel-postgres/src/index.js';
import { resolveJobsConfig } from '../../../packages/frogbot/src/jobs/config.js';

vi.mock('frogbot/jobs', () => import('../../../packages/frogbot/src/exports/jobs.js'));
vi.mock('frogbot/search', () => import('../../../packages/frogbot/src/exports/search.js'));

describe.each(['postgres', 'vercel-postgres'] as const)('%s atomic SQL', (kind) => {
  async function setup() {
    const descriptor =
      kind === 'postgres'
        ? postgresAdapter({ pool: {}, schemaName: 'worker' })
        : vercelPostgresAdapter({ pool: {}, schemaName: 'worker' });

    const payload = new BasePayload();

    payload.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Payload['logger'];

    payload.config = await buildConfig({
      secret: 'postgres-jobs-test',
      db: descriptor,
      collections: [],
      jobs: resolveJobsConfig({
        tasks: [{ slug: 'work', handler: () => ({ output: {} }) }],
      }),
    });

    payload.collections = Object.fromEntries(
      payload.config.collections.map((config) => [config.slug, { config }]),
    );

    const database = descriptor.init({ payload });

    payload.db = database;

    if (!database.init) throw new Error('The Postgres adapter must define init.');

    await database.init();

    const execute = vi.fn((_query: { text: string }, _params: unknown[]) =>
      Promise.resolve({ rows: [[7]], rowCount: 1 }),
    );

    const client = { query: execute };

    database.drizzle =
      kind === 'postgres'
        ? nodeDrizzle({ client: client as never, schema: database.schema })
        : vercelDrizzle({ client: client as never, schema: database.schema });

    return { payload, database, execute };
  }

  const lease = { processingToken: 'claim-token', processingUntil: '2099-01-01T00:00:00.000Z' };

  it('locks eligible rows with SKIP LOCKED and writes the lease in the claim statement', async () => {
    const { database, execute } = await setup();
    const sort = ['-createdAt'];

    expect(
      await database.updateJobs({
        data: { ...lease },
        returning: false,
        limit: 3,
        sort,
        where: {
          and: [
            { queue: { equals: "queue'; delete from jobs; --" } },
            { completedAt: { exists: false } },
            {
              or: [{ concurrencyKey: { exists: false } }, { concurrencyKey: { not_in: ['busy'] } }],
            },
          ],
        },
      }),
    ).toBeNull();

    expect(execute).toHaveBeenCalledOnce();

    const [{ text }, params] = execute.mock.calls[0];

    expect(text).toMatch(/^update "worker"\."payload_jobs"/);
    expect(text).toContain(' in (select ');
    expect(text).toContain('"completed_at" is null');
    expect(text).toContain('"concurrency_key" not in');
    expect(text).toContain('"processing_until" is null');
    expect(text).toContain('order by "worker"."payload_jobs"."created_at" desc limit');
    expect(text).toContain('for update of "payload_jobs" skip locked');
    expect(text).toContain('returning "id"');
    expect(text).not.toContain('delete from jobs');
    expect(params).toContain("queue'; delete from jobs; --");
    expect(params).toContain('claim-token');
    expect(params).toContain(3);
    expect(sort).toEqual(['-createdAt']);
  });

  it('locks each claimed key in order, then checks for a rival holder', async () => {
    const { database, execute } = await setup();

    execute.mockResolvedValueOnce({
      rows: [
        [7, 'b'],
        [8, 'a'],
        [9, 'b'],
      ] as never,
      rowCount: 3,
    });

    execute.mockResolvedValue({ rows: [], rowCount: 0 });

    await database.updateJobs({ data: { ...lease }, returning: false, limit: 3, where: {} });

    const [, first, second, check] = execute.mock.calls;

    expect(execute).toHaveBeenCalledTimes(4);
    expect(first[0].text).toContain('pg_advisory_xact_lock');
    expect(first[1]).toContain('a');
    expect(second[1]).toContain('b');
    expect(check[0].text).toContain('"concurrency_key" in');
    expect(check[1]).toEqual(expect.arrayContaining(['a', 'b', 'claim-token']));
  });

  it('guards single-ID claims and does not hydrate a losing claim', async () => {
    const { database, execute } = await setup();

    execute.mockResolvedValue({ rows: [], rowCount: 0 });

    expect(await database.updateJobs({ id: 7, data: { ...lease } })).toEqual([]);

    expect(execute).toHaveBeenCalledOnce();

    const [{ text }, params] = execute.mock.calls[0];

    expect(text).toContain('"processing_until" is null');
    expect(text).toContain('"id" =');
    expect(text).toContain('skip locked');
    expect(params).toContain(7);
    expect(params).toContain(1);
  });

  it('claims through the transaction connection ahead of primary and replica connections', async () => {
    const { database, execute } = await setup();

    const transactionExecute = vi.fn(() => Promise.resolve({ rows: [], rowCount: 0 }));
    const transaction = nodeDrizzle({ client: { query: transactionExecute } as never });

    database.sessions['job-transaction'] = {
      db: transaction as never,
      resolve: vi.fn(),
      reject: vi.fn(),
    };

    await database.updateJobs({
      id: 7,
      data: { ...lease },
      req: { transactionID: Promise.resolve('job-transaction') },
    });

    expect(transactionExecute).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
  });
});

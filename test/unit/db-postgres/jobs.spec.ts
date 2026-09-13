import { drizzle as nodeDrizzle } from 'drizzle-orm/node-postgres';
import { drizzle as vercelDrizzle } from 'drizzle-orm/vercel-postgres';
import { BasePayload, buildConfig, createLocalReq, type Payload } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { postgresAdapter } from '../../../packages/db-postgres/src/index.js';
import { vercelPostgresAdapter } from '../../../packages/db-vercel-postgres/src/index.js';
import { resolveJobsConfig } from '../../../packages/frogbot/src/jobs/config.js';
import {
  getJobLeaseContext,
  type JobLeaseDatabase,
  jobLeaseOperations,
  resetJobLease,
  withJobLease,
} from '../../../packages/frogbot/src/jobs/lease.js';

vi.mock('frogbot/jobs', () => import('../../../packages/frogbot/src/exports/jobs.js'));

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
        enableConcurrencyControl: true,
        tasks: [{ slug: 'work', handler: async () => ({ output: {} }) }],
      }),
    });

    payload.collections = Object.fromEntries(
      payload.config.collections.map((config) => [config.slug, { config }]),
    ) as Payload['collections'];

    const database = descriptor.init({ payload });

    payload.db = database;

    await database.init();

    const execute = vi.fn(async (_query: { text: string }, _params: unknown[]) => ({
      rows: [[7]],
      rowCount: 1,
    }));

    const client = { query: execute };

    database.drizzle =
      kind === 'postgres'
        ? nodeDrizzle({ client: client as never, schema: database.schema })
        : vercelDrizzle({ client: client as never, schema: database.schema });

    const req = await createLocalReq({}, payload);

    return { payload, database, execute, req };
  }

  it('locks eligible rows with SKIP LOCKED and writes the lease in the claim statement', async () => {
    const { payload, database, execute } = await setup();
    const sort = ['-createdAt'];

    const context = await withJobLease({
      payload,
      leaseDuration: 300_000,
      run: async () => {
        expect(
          await database.updateJobs({
            data: { processing: true },
            returning: false,
            limit: 3,
            sort,
            where: {
              and: [
                { queue: { equals: "queue'; delete from jobs; --" } },
                { completedAt: { exists: false } },
                {
                  or: [
                    { concurrencyKey: { exists: false } },
                    { concurrencyKey: { not_in: ['busy'] } },
                  ],
                },
              ],
            },
          }),
        ).toBeNull();

        return getJobLeaseContext()!;
      },
    });

    expect(execute).toHaveBeenCalledOnce();

    const [{ text }, params] = execute.mock.calls[0];

    expect(text).toMatch(/^update "worker"\."payload_jobs"/);
    expect(text).toContain(' in (select ');
    expect(text).toContain('"completed_at" is null');
    expect(text).toContain('"concurrency_key" not in');
    expect(text).toContain('order by "worker"."payload_jobs"."created_at" desc limit');
    expect(text).toContain('for update of "payload_jobs" skip locked');
    expect(text).toContain('returning "id"');
    expect(text).not.toContain('delete from jobs');
    expect(params).toContain("queue'; delete from jobs; --");
    expect(params).toContain(context.owner);
    expect(params).toContain(3);
    expect(context.ids).toEqual(new Set([7]));
    expect(sort).toEqual(['-createdAt']);
  });

  it('guards single-ID claims and does not hydrate a losing claim', async () => {
    const { payload, database, execute } = await setup();

    execute.mockResolvedValue({ rows: [], rowCount: 0 });

    await withJobLease({
      payload,
      leaseDuration: 300_000,
      run: async () => {
        expect(await database.updateJobs({ id: 7, data: { processing: true } })).toEqual([]);
        expect(getJobLeaseContext()!.ids.size).toBe(0);
      },
    });

    expect(execute).toHaveBeenCalledOnce();

    const [{ text }, params] = execute.mock.calls[0];

    expect(text).toContain('"processing" =');
    expect(text).toContain('"id" =');
    expect(text).toContain('skip locked');
    expect(params).toContain(false);
    expect(params).toContain(7);
    expect(params).toContain(1);
  });

  it('emits a conditional lease update with all ownership and expiry predicates', async () => {
    const { database, execute, req } = await setup();

    await resetJobLease({
      id: 7,
      owner: 'observed-owner',
      leaseUntil: '2020-01-01T00:00:00.000Z',
      req,
    });

    expect((database as JobLeaseDatabase)[jobLeaseOperations]).toBeDefined();
    expect(execute).toHaveBeenCalledOnce();

    const [{ text }, params] = execute.mock.calls[0];

    expect(text).toMatch(/^update /);
    expect(text).not.toContain('select');
    expect(text).toContain('"lease_owner" =');
    expect(text).toContain('"lease_until" =');
    expect(text).toContain('"lease_until" <=');
    expect(text).toContain('"completed_at" is null');
    expect(params).toContain('observed-owner');
    expect(params).toContain('2020-01-01T00:00:00.000Z');
  });

  it('uses the transaction connection ahead of primary and replica connections', async () => {
    const { database, execute, req } = await setup();

    const transactionExecute = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const transaction = nodeDrizzle({ client: { query: transactionExecute } as never });

    database.sessions['job-transaction'] = {
      db: transaction as never,
      resolve: vi.fn(),
      reject: vi.fn(),
    };

    await resetJobLease({
      id: 7,
      owner: 'observed',
      leaseUntil: '2020-01-01T00:00:00.000Z',
      req: { ...req, transactionID: Promise.resolve('job-transaction') },
    });

    expect(transactionExecute).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
  });
});

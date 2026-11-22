import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import { stopJobs } from '../../packages/frogbot/dist/jobs/stop.js';
import { adapterName, bootJobsFixture, type FrogBotJob } from './fixture.js';

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;

beforeAll(async () => {
  fixture = await bootJobsFixture({
    jobs: {
      workflows: [
        {
          slug: 'keyed',
          concurrency: ({ input }) => String(input.key),
          handler: async ({ job, tasks }) => {
            await tasks['record-effect']('effect', { input: { marker: job.input.marker } });
          },
        },
      ],
    },
  });
});

afterAll(async () => {
  await fixture?.shutdown();
});

async function readJob(id: number | string) {
  const result = await fixture.payload.db.find<FrogBotJob>({
    collection: 'payload-jobs',
    where: { id: { equals: id } },
    limit: 1,
  });

  return result.docs[0];
}

type PgClient = {
  query(text: string, values?: unknown[]): Promise<{ rows: { n: string }[] }>;
  release(): void;
};

it.runIf(adapterName === 'postgres')(
  'a stop that lands while a claim is in flight leaves the job free for the next server',
  async () => {
    const queue = randomUUID();
    const job = await fixture.frogbot.jobs.queue({
      workflow: 'keyed',
      queue,
      input: { key: queue, marker: queue },
      overrideAccess: true,
    });

    const pool = (fixture.payload.db as unknown as { pool: { connect(): Promise<PgClient> } }).pool;
    const locker = await pool.connect();
    const watcher = await pool.connect();

    await locker.query('BEGIN');
    const key = (await readJob(job.id)).concurrencyKey;

    expect(key).toBeTruthy();

    await locker.query(
      "SELECT pg_advisory_xact_lock(hashtext('frogbot.jobs.concurrencyKey'), hashtext($1))",
      [key],
    );

    const run = fixture.frogbot.jobs.run({ queue, overrideAccess: true });

    await vi.waitFor(
      async () => {
        const { rows } = await watcher.query(
          "SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()",
        );

        expect(Number(rows[0].n)).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );

    const stopped = stopJobs({ payload: fixture.payload });

    await locker.query('COMMIT');
    await stopped;
    locker.release();
    watcher.release();

    await run;

    const after = await readJob(job.id);

    expect(after).toMatchObject({ processingToken: null, processingUntil: null });
  },
);

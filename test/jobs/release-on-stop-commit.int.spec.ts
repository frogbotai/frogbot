import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { stopJobs } from '../../packages/frogbot/dist/jobs/stop.js';
import { bootJobsFixture, deferred, type FrogBotJob } from './fixture.js';

const started = deferred();
let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;

beforeAll(async () => {
  fixture = await bootJobsFixture({
    transactions: true,
    jobs: {
      workflows: [
        {
          slug: 'keyed',
          concurrency: ({ input }) => String(input.key),
          handler: async () => {
            started.resolve();
            await new Promise(() => undefined);
          },
        },
      ],
    },
  });
});

afterAll(async () => {
  await fixture?.shutdown();
});

it('a stop that lands while the claim transaction commits leaves the job free', async () => {
  const queue = randomUUID();
  const job = await fixture.frogbot.jobs.queue({
    workflow: 'keyed',
    queue,
    input: { key: queue, marker: queue },
    overrideAccess: true,
  });

  const db = fixture.payload.db;
  const commit = db.commitTransaction.bind(db);
  let stopped: Promise<void> | undefined;

  db.commitTransaction = async (id) => {
    if (!stopped) {
      stopped = stopJobs({ payload: fixture.payload });

      // eslint-disable-next-line no-restricted-syntax -- the window under test has no event to wait on: the release must reach the database before this commit does
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return commit(id);
  };

  void fixture.frogbot.jobs.run({ queue, overrideAccess: true }).catch(() => undefined);

  await started.promise;
  await stopped;

  db.commitTransaction = commit;

  expect(stopped).toBeDefined();

  const { docs } = await db.find<FrogBotJob>({
    collection: 'payload-jobs',
    where: { id: { equals: job.id } },
    limit: 1,
  });

  expect(docs[0]).toMatchObject({ processingToken: null, processingUntil: null });
});

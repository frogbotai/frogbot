import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import { adapterName, bootJobsFixture, deferred } from './fixture.js';

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;
const stock = process.env.TICKET121_BASELINE === '1';

beforeAll(async () => {
  if (adapterName !== 'mongodb') {
    throw new Error('The baseline reproduction requires TICKET121_ADAPTER=mongodb.');
  }

  fixture = await bootJobsFixture();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await fixture?.shutdown();
});

it(`${stock ? 'stock' : 'FrogBot'} limited claims must not execute the same job twice`, async () => {
  const require = createRequire(new URL('../../packages/db-mongodb/package.json', import.meta.url));
  const modulePath = join(dirname(require.resolve('@payloadcms/db-mongodb')), 'updateJobs.js');
  const { updateJobs } = await import(pathToFileURL(modulePath).href);
  const adapter = fixture.payload.db;
  const original = adapter.updateJobs;
  const model = adapter.collections['payload-jobs'];
  const find = model.find.bind(model);
  const barrier = deferred();
  let snapshots = 0;

  await Promise.all(
    Array.from({ length: 2 }, () =>
      fixture.frogbot.jobs.queue({
        task: 'record-effect',
        queue: 'baseline',
        input: { marker: 'baseline' },
      }),
    ),
  );

  async function pauseSnapshot() {
    if (snapshots < 2) {
      snapshots++;

      if (snapshots === 2) barrier.resolve();

      await barrier.promise;
    }
  }

  const nativeFind = adapter.find.bind(adapter);
  const snapshot = stock
    ? vi.spyOn(model, 'find').mockImplementation(async (...args) => {
        const documents = await find(...args);

        await pauseSnapshot();

        return documents;
      })
    : vi.spyOn(adapter, 'find').mockImplementation(async (args) => {
        const result = await nativeFind(args);

        await pauseSnapshot();

        return result;
      });

  if (stock) adapter.updateJobs = updateJobs.bind(adapter);

  try {
    await Promise.all([
      fixture.frogbot.jobs.run({ queue: 'baseline', limit: 2 }),
      fixture.payload.jobs.run({ queue: 'baseline', limit: 2 }),
    ]);
  } finally {
    snapshot.mockRestore();
    adapter.updateJobs = original;
  }

  const recorded = await fixture.payload.find({ collection: 'effects', limit: 0 });

  expect(snapshots).toBe(2);
  expect(recorded.docs).toHaveLength(2);
  expect(new Set(recorded.docs.map((row) => row.jobRecord)).size).toBe(2);
});

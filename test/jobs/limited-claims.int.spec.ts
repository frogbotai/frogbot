import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { adapterName, bootJobsFixture, deferred } from './fixture.js';

describe.runIf(adapterName === 'mongodb')('limited claims on MongoDB', () => {
  let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;

  beforeAll(async () => {
    fixture = await bootJobsFixture();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await fixture?.shutdown();
  });

  it('two workers claiming with a limit never run the same job twice', async () => {
    const adapter = fixture.payload.db;
    const find = adapter.find.bind(adapter);
    const barrier = deferred();
    let snapshots = 0;

    await Promise.all(
      Array.from({ length: 2 }, () =>
        fixture.frogbot.jobs.queue({
          task: 'record-effect',
          queue: 'limited-claims',
          input: { marker: 'limited-claims' },
        }),
      ),
    );

    vi.spyOn(adapter, 'find').mockImplementation(async (args) => {
      const result = await find(args);

      if (snapshots < 2) {
        snapshots++;

        if (snapshots === 2) barrier.resolve();

        await barrier.promise;
      }

      return result;
    });

    await Promise.all([
      fixture.frogbot.jobs.run({ queue: 'limited-claims', limit: 2 }),
      fixture.payload.jobs.run({ queue: 'limited-claims', limit: 2 }),
    ]);

    const recorded = await fixture.payload.find({ collection: 'effects', limit: 0 });

    expect(snapshots).toBe(2);
    expect(recorded.docs).toHaveLength(2);
    expect(new Set(recorded.docs.map((row) => row.jobRecord)).size).toBe(2);
  });
});

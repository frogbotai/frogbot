import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adapterName, bootJobsFixture, type FrogBotJob } from './fixture.js';

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;

beforeAll(async () => {
  fixture = await bootJobsFixture({ jobs: { enableConcurrencyControl: false } });
});

afterAll(async () => {
  await fixture?.shutdown();
});

describe(`concurrency control opt-out: ${adapterName}`, () => {
  it('boots without the concurrency key and still runs jobs', async () => {
    expect(fixture.payload.config.jobs.enableConcurrencyControl).toBe(false);

    const collection = fixture.payload.collections['payload-jobs'].config;

    expect(
      collection.fields.some((field) => 'name' in field && field.name === 'concurrencyKey'),
    ).toBe(false);

    const marker = randomUUID();
    const job = await fixture.frogbot.jobs.queue({
      task: 'record-effect',
      queue: marker,
      input: { marker },
    });

    await fixture.frogbot.jobs.run({ queue: marker });

    const jobs = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      where: { id: { equals: job.id } },
      pagination: false,
    });
    const effects = await fixture.payload.db.find({
      collection: 'effects',
      where: { marker: { equals: marker } },
      pagination: false,
    });

    expect(jobs.docs[0]).toMatchObject({ completedAt: expect.any(String), hasError: false });
    expect(jobs.docs[0]).not.toHaveProperty('concurrencyKey');
    expect(effects.docs).toHaveLength(1);
  });
});

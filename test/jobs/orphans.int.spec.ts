import type { Job } from 'payload';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { bootJobsFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;

beforeAll(async () => {
  fixture = await bootJobsFixture();
});

afterAll(async () => {
  await fixture?.shutdown();
});

async function job(marker: string, data: Record<string, unknown>) {
  return fixture.payload.db.create({
    collection: 'payload-jobs',
    data: { input: { marker }, queue: 'default', totalTried: 1, ...data },
  });
}

it('the sweep deletes only failed scheduled jobs whose task is gone', async () => {
  const failed = { hasError: true, error: { message: 'Task is not registered.' } };
  const scheduled = { meta: { scheduled: true } };

  await job('orphan', {
    taskSlug: 'frogbot-reset-ai-budgets',
    ...scheduled,
    ...failed,
  });

  const kept = await Promise.all([
    job('registered', { taskSlug: 'fail-for-good', ...scheduled, ...failed }),
    job('pending', { taskSlug: 'frogbot-reset-ai-budgets', ...scheduled, totalTried: 0 }),
    job('unscheduled', { taskSlug: 'frogbot-reset-ai-budgets', ...failed }),
  ]);

  const sweep = await fixture.payload.jobs.queue({
    task: 'frogbot-sweep-waitpoints',
    input: {},
    overrideAccess: true,
  });

  await fixture.payload.jobs.run({ where: { id: { equals: sweep.id } }, overrideAccess: true });

  const { docs } = await fixture.payload.db.find({
    collection: 'payload-jobs',
    pagination: false,
    where: { id: { not_equals: sweep.id } },
  });

  expect(docs.map(({ id }) => String(id)).sort()).toEqual(kept.map(({ id }) => String(id)).sort());
  expect(
    (
      await fixture.payload.db.findOne<Job>({
        collection: 'payload-jobs',
        where: { id: { equals: sweep.id } },
      })
    )?.completedAt,
  ).toBeTruthy();
});

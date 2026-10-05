import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import type { StubChatModel } from '../../__helpers/shared/StubChatModel';
import { startStubChatModel } from '../../__helpers/shared/StubChatModel';
import { aiFieldTaskSlug, jobsSlug, modelPort, tasksSlug, usageLogsSlug } from '../shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type Doc = Record<string, unknown> & { id: number | string };

describe('aiField runs with concurrency control off', () => {
  let booted: BootedFrogBot;
  let model: StubChatModel;

  beforeAll(async () => {
    model = await startStubChatModel(modelPort);
    booted = await bootFrogBot(dirname, 'ai-field-concurrency-off');
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  afterEach(async () => {
    await vi.waitFor(
      async () => {
        const { totalDocs } = await booted.payload.count({ collection: usageLogsSlug as never });

        if (totalDocs !== model.titleRequests.length) {
          throw new Error('[test] usage rows are still being written');
        }
      },
      { timeout: 10_000 },
    );

    for (const collection of [usageLogsSlug, jobsSlug]) {
      await booted.payload.delete({ collection: collection as never, where: {} });
    }

    model.reset();
  });

  afterAll(async () => {
    await booted?.shutdown();
    await model?.close();
  });

  async function waitingSummaryRuns() {
    const result = await booted.payload.find({
      collection: jobsSlug,
      where: {
        and: [
          { taskSlug: { equals: aiFieldTaskSlug } },
          { 'input.field': { equals: 'summary' } },
          { completedAt: { exists: false } },
        ],
      },
      depth: 0,
      pagination: false,
    });

    return result.docs;
  }

  function createTask(data: Record<string, unknown>): Promise<Doc> {
    return booted.frogbot.create({
      collection: tasksSlug,
      data: data as never,
    }) as Promise<unknown> as Promise<Doc>;
  }

  function findTask(id: Doc['id']): Promise<Doc> {
    return booted.frogbot.findByID({
      collection: tasksSlug,
      id,
      depth: 0,
    }) as Promise<unknown> as Promise<Doc>;
  }

  it('boots without concurrency control and runs a queued AI field', async () => {
    expect(booted.payload.config.jobs.enableConcurrencyControl).toBe(false);

    const task = await createTask({ notes: 'Paint the fence' });

    model.respondTitle({ text: 'A fence job.' });

    await booted.frogbot.jobs.run({ queue: 'default' });

    expect(await findTask(task.id)).toMatchObject({
      summary: 'A fence job.',
      _summary_status: 'done',
    });
  });

  it('two quick edits queue two runs', async () => {
    const task = await createTask({ notes: 'one' });

    await booted.frogbot.update({ collection: tasksSlug, id: task.id, data: { notes: 'two' } });

    expect(await waitingSummaryRuns()).toHaveLength(2);
  });

  it('a run whose inputs changed saves nothing', async () => {
    const task = await createTask({ notes: 'one' });

    let release!: () => void;

    model.respondTitle({ text: 'From one', hold: new Promise((done) => (release = done)) });

    const run = booted.frogbot.jobs.run({ queue: 'default' });

    await vi.waitFor(() => expect(model.titleRequests).toHaveLength(1), { timeout: 10_000 });

    await booted.frogbot.update({ collection: tasksSlug, id: task.id, data: { notes: 'two' } });

    release();
    await run;

    const saved = await findTask(task.id);

    expect(saved.summary ?? null).toBeNull();
    expect(saved._summary_status).toBe('pending');
    expect(await waitingSummaryRuns()).toHaveLength(1);
  });
});

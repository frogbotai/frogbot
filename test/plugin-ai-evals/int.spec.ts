import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DocID } from 'frogbot';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import type { StubChatModel } from '../__helpers/shared/StubChatModel.js';
import { startStubChatModel } from '../__helpers/shared/StubChatModel.js';
import { deniedEmail, failNextWrite, modelPort, offListModel, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type Run = {
  id: DocID;
  status: string;
  agent: string;
  model?: string | null;
  total: number;
  passed: number;
  errored: number;
  score: number | null;
  scorerMeans: Record<string, number>;
  startedAt?: string;
  finishedAt?: string;
  createdBy?: unknown;
};

type Result = {
  id: DocID;
  case: DocID;
  output?: string | null;
  error?: string | null;
  toolCalls?: { toolName: string; output?: unknown }[] | null;
  caseSnapshot: { input: string };
  scores: { scorer: string; score: number | null; reason?: string | null }[];
};

const judged = (score: number) => ({ text: JSON.stringify({ score, reason: 'Judged.' }) });

describe('plugin-ai-evals', () => {
  let booted: BootedFrogBot;
  let model: StubChatModel;

  beforeAll(async () => {
    model = await startStubChatModel(modelPort);
    booted = await bootFrogBot(dirname, 'plugin-ai-evals');
  });

  afterAll(async () => {
    await booted?.shutdown();
    await model?.close();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
    await booted.payload.db.deleteMany({ collection: 'payload-jobs', where: {} });
    model.reset();
    failNextWrite.clear();
  });

  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  async function createUser(email: string) {
    const user = await booted.frogbot.create({
      collection: usersSlug,
      data: { email, password: 'frogbot-test-password' },
      overrideAccess: true,
    });

    return { ...user, collection: usersSlug };
  }

  async function createDataset(scorers: string[], inputs: string[], name = 'billing') {
    const dataset = await booted.frogbot.create({
      collection: 'eval-datasets',
      data: { name, agent: 'support', scorers },
      overrideAccess: true,
    });

    for (const input of inputs) {
      await booted.frogbot.create({
        collection: 'eval-cases',
        data: { dataset: dataset.id, input },
        overrideAccess: true,
      });
    }

    return dataset.id;
  }

  async function startRun(
    dataset: DocID,
    {
      user,
      model: runModel,
    }: { user?: Awaited<ReturnType<typeof createUser>>; model?: string } = {},
  ) {
    const req = await booted.frogbot.createRequest(user ? { user } : {});

    return (await booted.frogbot.create({
      collection: 'eval-runs',
      data: { dataset, ...(runModel ? { model: runModel } : {}) },
      overrideAccess: !user,
      req,
    })) as unknown as Run;
  }

  async function jobFor(run: DocID) {
    const { docs } = await booted.payload.db.find<{ id: DocID; completedAt?: string }>({
      collection: 'payload-jobs',
      where: { jobId: { equals: `frogbot-eval-run:${run}` } },
      limit: 1,
      pagination: false,
    });

    return docs[0];
  }

  async function runJob(run: DocID) {
    const job = await jobFor(run);

    expect(job).toBeDefined();

    await booted.frogbot.jobs.runByID({ id: job.id, silent: true, overrideAccess: true });
  }

  async function readRun(id: DocID) {
    return (await booted.frogbot.findByID({
      collection: 'eval-runs',
      id,
      overrideAccess: true,
    })) as unknown as Run;
  }

  async function results(run: DocID) {
    const { docs } = await booted.frogbot.find({
      collection: 'eval-results',
      where: { run: { equals: run } },
      sort: 'id',
      pagination: false,
      overrideAccess: true,
    });

    return (docs as unknown as Result[]).sort((a, b) =>
      a.caseSnapshot.input.localeCompare(b.caseSnapshot.input),
    );
  }

  const lookup = { id: 'call-1', name: 'findInvoices', input: { customer: 'ada' } };

  it("a user's three-case run writes three scored results and the totals", async () => {
    const ada = await createUser('ada@evals.test');
    const dataset = await createDataset(
      ['usedLookup', 'mentions42', 'grounded'],
      ['1 owes', '2 owes', '3 owes'],
    );

    model.respond(
      { toolCalls: [lookup] },
      { text: 'You owe 42.' },
      { text: 'You owe 42.' },
      { text: 'Nothing.' },
    );

    model.respondTitle(judged(1), judged(0.5), judged(0));

    const run = await startRun(dataset, { user: ada });

    expect(run).toMatchObject({ status: 'queued', agent: 'support' });

    await booted.frogbot.update({
      collection: 'eval-runs',
      id: run.id,
      data: { status: 'completed', score: 1, agent: 'other' },
      overrideAccess: false,
      req: await booted.frogbot.createRequest({ user: ada }),
    });

    expect(await readRun(run.id)).toMatchObject({
      status: 'queued',
      agent: 'support',
      score: null,
    });

    await runJob(run.id);

    const saved = await results(run.id);

    expect(saved.map(({ scores }) => scores.map(({ score }) => score))).toEqual([
      [1, 1, 1],
      [0, 1, 0.5],
      [0, 0, 0],
    ]);
    expect(saved[0].toolCalls).toEqual([
      { toolName: 'findInvoices', input: { customer: 'ada' }, output: { total: 42 } },
    ]);
    expect(saved[1].scores[0].reason).toBe('Never called findInvoices.');

    const finished = await readRun(run.id);

    expect(finished).toMatchObject({
      status: 'completed',
      total: 3,
      passed: 1,
      errored: 0,
      scorerMeans: { usedLookup: 1 / 3, mentions42: 2 / 3, grounded: 0.5 },
    });
    expect(finished.score).toBeCloseTo(0.5);
    expect(finished.startedAt).toBeTruthy();
    expect(finished.finishedAt).toBeTruthy();
    expect(finished.createdBy).toBeTruthy();
    expect(model.titleRequests.every(({ model: id }) => id === 'judge')).toBe(true);
  });

  it('a retry after a failed result write runs only the unsaved case', async () => {
    const dataset = await createDataset(['mentions42'], ['1 owes', '2 owes', '3 owes']);

    failNextWrite.add('3 owes');

    const run = await startRun(dataset);

    await runJob(run.id);

    expect(model.requests).toHaveLength(3);
    expect(await results(run.id)).toHaveLength(2);
    expect((await readRun(run.id)).status).toBe('failed');

    model.reset();
    await runJob(run.id);

    expect(model.requests).toHaveLength(1);
    expect(JSON.stringify(model.requests[0].messages)).toContain('3 owes');
    expect(await results(run.id)).toHaveLength(3);
    expect(await readRun(run.id)).toMatchObject({ status: 'completed', total: 3 });
  });

  it('counts an agent error and scores the other cases', async () => {
    const dataset = await createDataset(['mentions42'], ['1 owes', '2 owes', '3 owes']);

    model.respond(
      { text: '42' },
      { error: { status: 400, body: { error: { message: 'bad request' } } } },
      { text: '42' },
    );

    const run = await startRun(dataset);

    await runJob(run.id);

    const saved = await results(run.id);

    expect(saved[1]).toMatchObject({ scores: [], output: null });
    expect(saved[1].error).toBeTruthy();
    expect(saved[0].scores[0].score).toBe(1);
    expect(saved[2].scores[0].score).toBe(1);
    expect(await readRun(run.id)).toMatchObject({
      status: 'completed',
      total: 3,
      errored: 1,
      passed: 2,
      scorerMeans: { mentions42: 2 / 3 },
    });
  });

  it("errors a user's cases when their AI access denies them, and a run with no user succeeds", async () => {
    const denied = await createUser(deniedEmail);
    const dataset = await createDataset(['mentions42'], ['1 owes']);

    const theirs = await startRun(dataset, { user: denied });

    await runJob(theirs.id);

    expect(model.requests).toHaveLength(0);
    expect((await results(theirs.id))[0].error).toContain('allowed for this user');
    expect(await readRun(theirs.id)).toMatchObject({ status: 'completed', errored: 1 });

    model.respond({ text: '42' });

    const trusted = await startRun(dataset);

    await runJob(trusted.id);

    expect(await readRun(trusted.id)).toMatchObject({ status: 'completed', errored: 0, passed: 1 });
    expect((await readRun(trusted.id)).createdBy ?? null).toBeNull();
  });

  it('fails a run whose creator was deleted instead of running it trusted', async () => {
    const gone = await createUser('gone@evals.test');
    const dataset = await createDataset(['mentions42'], ['1 owes']);
    const run = await startRun(dataset, { user: gone });

    await booted.frogbot.delete({ collection: usersSlug, id: gone.id, overrideAccess: true });
    await runJob(run.id);

    expect(model.requests).toHaveLength(0);
    expect(await results(run.id)).toHaveLength(0);
    expect((await readRun(run.id)).status).toBe('failed');
  });

  it('saves no chat, refuses an off-list model before queueing, and runs an allowed one', async () => {
    const dataset = await createDataset(['mentions42'], ['1 owes']);

    await expect(startRun(dataset, { model: offListModel })).rejects.toThrow(
      `Model '${offListModel}' isn't one of agent 'support''s models.`,
    );
    expect(
      (await booted.payload.db.find({ collection: 'payload-jobs', where: {}, pagination: false }))
        .docs,
    ).toHaveLength(0);

    const run = await startRun(dataset, { model: 'test/other' });

    await runJob(run.id);

    expect(model.requests.map(({ model: id }) => id)).toEqual(['other']);
    expect(await readRun(run.id)).toMatchObject({ status: 'completed', model: 'test/other' });
    expect(
      (await booted.frogbot.count({ collection: 'chats', overrideAccess: true })).totalDocs,
    ).toBe(0);
  });

  describe('evals:run', () => {
    async function cli(args: string[]) {
      const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      await booted.frogbot.config.cli.commands['evals:run']({
        args,
        command: 'evals:run',
        getConfig: () => Promise.resolve(booted.frogbot.config),
        getFrogBot: () => Promise.resolve(booted.frogbot),
      });

      const lines = write.mock.calls.map(([chunk]) => String(chunk).trimEnd());

      write.mockRestore();

      return lines;
    }

    it('exits 0 when every case passes and prints the means and score', async () => {
      await createDataset(['mentions42'], ['1 owes', '2 owes']);
      model.respond({ text: '42' }, { text: '42' });

      const lines = await cli(['billing', '--min-score', '0.9']);

      expect(process.exitCode ?? 0).toBe(0);
      expect(lines).toEqual(
        expect.arrayContaining([
          'mentions42: 1.000',
          expect.stringMatching(/^score: 1\.000 · 2\/2 passed · 0 errored · completed$/),
        ]),
      );

      const { docs } = await booted.frogbot.find({
        collection: 'eval-runs',
        overrideAccess: true,
      });

      expect(docs[0]).toMatchObject({ status: 'completed' });
      expect((docs[0] as { createdBy?: unknown }).createdBy ?? null).toBeNull();
    });

    it('exits 1 below --min-score', async () => {
      const dataset = await createDataset(['mentions42'], ['1 owes', '2 owes']);
      model.respond({ text: '42' }, { text: 'no idea' });

      await cli([String(dataset), '--min-score=0.9']);

      expect(process.exitCode).toBe(1);
    });

    it('exits 1 on an errored case', async () => {
      await createDataset(['mentions42'], ['1 owes']);
      model.respond({ error: { status: 400, body: { error: { message: 'bad request' } } } });

      await cli(['billing']);

      expect(process.exitCode).toBe(1);
    });
  });
});

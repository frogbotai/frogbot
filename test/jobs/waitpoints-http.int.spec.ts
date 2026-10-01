import { randomUUID } from 'node:crypto';

import { definePiece } from 'frogbot/pieces';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { WorkflowHandler } from '../../packages/frogbot/dist/jobs/types.js';
import type { Waitpoint } from '../../packages/frogbot/dist/jobs/waitpoints/types.js';
import { adapterName, bootJobsFixture, deferred } from './fixture.js';

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;
let handler: WorkflowHandler;
const triggerContexts: unknown[] = [];
const activeRuns: { release: () => void; run: Promise<unknown> }[] = [];

const reservedResumeData = ['__proto__', 'constructor', 'prototype'].flatMap<unknown>((key) => [
  { [key]: { approved: false } },
  { nested: { [key]: { approved: false } } },
  [{ [key]: { approved: false } }],
]);

const replySchema = z.object({ token: z.string(), messageId: z.string() });
const inbox = definePiece({
  slug: 'waitpoint-inbox',
  label: 'Waitpoint test inbox',
  actions: [],
  webhook: {
    verify: async ({ req }) => req.headers.get('x-test-inbox') === 'local-reply',
    parse: () => ({ event: 'reply' }),
  },
  triggers: [
    {
      slug: 'reply',
      type: 'app',
      event: 'reply',
      description: 'Receive a local test reply.',
      input: z.object({}),
      output: replySchema,
      run: async ({ req }) => {
        const data = replySchema.parse(req.data);

        return [{ dedupeKey: data.messageId, data }];
      },
    },
  ],
})({});

beforeAll(async () => {
  fixture = await bootJobsFixture({
    config: {
      routes: { api: '/custom-api' },
      ai: { providers: { openai: { apiKey: 'local-test-unused' } }, defaultModel: 'openai/gpt-4o' },
      agents: [
        {
          slug: 'reply-resumer',
          instructions: 'Handle local test replies.',
          triggers: [
            {
              trigger: inbox.triggers.reply,
              handler: async ({ event, req }) => {
                const { token, messageId } = replySchema.parse(event);

                triggerContexts.push(req.context.trigger);

                await req.frogbot.jobs.resume({ token, data: { messageId }, req });
              },
            },
          ],
        },
      ],
    },
    jobs: {
      deleteJobOnComplete: false,
      enableConcurrencyControl: true,
      workflows: [
        {
          slug: 'http-wait',
          queue: 'approvals',
          retries: { attempts: 3, backoff: { type: 'fixed', delay: 0 } },
          handler: (args) => handler(args),
        },
        {
          slug: 'http-wait-failure',
          queue: 'approvals',
          retries: 0,
          handler: (args) => handler(args),
        },
        {
          slug: 'http-wait-supersede',
          queue: 'approvals',
          concurrency: { key: ({ input }) => String(input.key), supersedes: true },
          handler: (args) => handler(args),
        },
        {
          slug: 'scheduled-http-wait',
          queue: 'scheduled-http-approvals',
          retries: { attempts: 3, backoff: { type: 'fixed', delay: 0 } },
          schedule: [{ cron: '* * * * *', queue: 'scheduled-http-approvals' }],
          handler: (args) => handler(args),
        },
      ],
    },
  });
});

afterEach(async () => {
  for (const { release } of activeRuns) release();

  await Promise.all(activeRuns.map(({ run }) => run));

  activeRuns.length = 0;

  vi.useRealTimers();
  triggerContexts.length = 0;

  await fixture.payload.delete({ collection: 'payload-jobs', where: {} });
  await fixture.payload.delete({ collection: 'frogbot-waitpoints', where: {} });
});

afterAll(async () => fixture?.shutdown());

function request(url: string, options?: RequestInit) {
  return fixture.frogbot.handleRequest(new Request(url, options));
}

function post(url: string, data: unknown) {
  return request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
}

async function waits() {
  const result = await fixture.payload.db.find({
    collection: 'frogbot-waitpoints',
    where: {},
    sort: 'id',
    limit: 0,
    pagination: false,
  });

  return result.docs as Waitpoint[];
}

async function jobs() {
  return (await fixture.payload.db.find({ collection: 'payload-jobs', where: {}, limit: 0 })).docs;
}

async function holder(id: number | string) {
  const stored = await jobs();

  expect(stored.filter(({ jobId }) => jobId?.startsWith('frogbot-waitpoint:'))).toEqual([]);

  return stored.find((job) => job.id === id)!;
}

async function runSource() {
  const source = await fixture.frogbot.jobs.queue({
    workflow: 'http-wait',
    input: { requestId: randomUUID() },
  });

  await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

  return source;
}

async function sweep() {
  const job = await fixture.worker.jobs.queue({ task: 'frogbot-sweep-jobs', input: {} });

  await fixture.worker.jobs.runByID({ id: job.id, silent: true });

  const stored = (await jobs()).find(({ id }) => id === job.id)!;

  expect(stored.completedAt).toEqual(expect.any(String));
  expect(stored.hasError).not.toBe(true);
}

function approval(onResult?: (result: unknown) => void) {
  let url = '';

  handler = async ({ waitFor }) => {
    const result = await waitFor('approval', {
      onWait: ({ resumeUrl }) => {
        url = resumeUrl;
      },
    });

    onResult?.(result);
  };

  return () => url;
}

describe(`durable wait HTTP acceptance: ${adapterName}`, () => {
  it('a paused workflow keeps its row live and is not deleted', async () => {
    const until = new Date(Date.now() + 60_000).toISOString();
    const prepare = vi.fn(async () => ({ output: { prepared: true } }));

    handler = async ({ inlineTask, waitFor }) => {
      await inlineTask('prepare', { task: prepare });

      await waitFor('delay', { until });
    };

    const source = await runSource();

    const stored = await jobs();
    const waiting = await waits();

    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: source.id,
      completedAt: null,
      processing: false,
      hasError: false,
      error: null,
      leaseOwner: null,
      leaseUntil: null,
      totalTried: 0,
      waitUntil: until,
      log: [expect.objectContaining({ taskID: 'prepare', taskSlug: 'inline', state: 'succeeded' })],
    });
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ holder: source.id, kind: 'delay', dispatched: true });
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('the /api/payload-jobs/run endpoint does not claim a paused row', async () => {
    const started = vi.fn();
    const until = new Date(Date.now() + 60_000).toISOString();

    handler = async ({ waitFor }) => {
      started();

      await waitFor('delay', { until });
    };

    const source = await runSource();

    const before = await jobs();

    const response = await request(
      'https://jobs.example.com/custom-api/payload-jobs/run?allQueues=true&disableScheduling=true',
    );

    const after = await jobs();

    expect(response.status).toBe(200);
    expect(before).toHaveLength(1);
    expect(after).toEqual(before);
    expect(after[0].id).toBe(source.id);
    expect(started).toHaveBeenCalledTimes(1);
  });

  it('a paused scheduled workflow skips the next schedule tick after an earlier failed attempt', async () => {
    const now = Date.now();
    const until = new Date(now + 600_000).toISOString();
    const failure = new Error('Scheduled preparation failed');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);

    handler = vi
      .fn<WorkflowHandler>()
      .mockImplementationOnce(async ({ inlineTask }) => {
        await inlineTask('failed', {
          task: async () => {
            throw failure;
          },
        });
      })
      .mockImplementationOnce(async () => {
        throw failure;
      })
      .mockImplementation(async ({ waitFor }) => {
        await waitFor('delay', { until });
      });

    const firstTick = await fixture.frogbot.jobs.handleSchedules({
      queue: 'scheduled-http-approvals',
    });

    const scheduled = await jobs();

    expect(firstTick.errored).toEqual([]);
    expect(firstTick.queued).toHaveLength(1);
    expect(scheduled).toHaveLength(1);

    vi.setSystemTime(new Date(scheduled[0].waitUntil).getTime() + 1);

    await fixture.frogbot.jobs.runByID({ id: scheduled[0].id, silent: true });

    const failed = (await jobs())[0];

    expect(failed.hasError).toBe(false);
    expect(failed.log).toEqual([expect.objectContaining({ taskID: 'failed', state: 'failed' })]);

    await fixture.worker.jobs.runByID({ id: scheduled[0].id, silent: true });

    const retrying = (await jobs())[0];

    expect(retrying.error).toBeTruthy();
    expect(retrying.hasError).toBe(false);

    await fixture.frogbot.jobs.runByID({ id: scheduled[0].id, silent: true });

    const paused = (await jobs())[0];

    expect(paused).toMatchObject({ id: scheduled[0].id, waitUntil: until, totalTried: 0, log: [] });
    expect(paused.completedAt).toBeNull();
    expect(paused.error).toBeNull();

    vi.setSystemTime(Date.now() + 60_000);

    const nextTick = await fixture.frogbot.jobs.handleSchedules({
      queue: 'scheduled-http-approvals',
    });

    const stored = await jobs();

    expect(nextTick.errored).toEqual([]);
    expect(nextTick.queued).toEqual([]);
    expect(nextTick.skipped).toHaveLength(1);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: scheduled[0].id,
      waitUntil: until,
      meta: { scheduled: true },
    });
  });

  it('confirms via the registered router and resumes the same row with the HTML form', async () => {
    const finished = vi.fn();
    const prepare = vi.fn(async () => ({ output: { sent: true } }));
    let url = '';

    handler = async ({ inlineTask, waitFor }) => {
      await inlineTask('prepare', { task: prepare });

      finished(
        await waitFor('approval', {
          onWait: ({ resumeUrl }) => {
            url = resumeUrl;
          },
        }),
      );
    };

    const source = await runSource();
    const before = (await waits())[0];

    expect(url).toBe(`https://jobs.example.com/custom-api/jobs/${before.token}/resume`);
    expect(Buffer.from(before.token, 'base64url')).toHaveLength(32);
    expect(await holder(source.id)).toMatchObject({
      completedAt: null,
      processing: false,
      hasError: false,
      totalTried: 0,
      waitUntil: before.expiresAt,
      input: source.input,
      log: [expect.objectContaining({ taskID: 'prepare', state: 'succeeded' })],
    });
    expect(before.holder).toBe(source.id);
    expect(finished).not.toHaveBeenCalled();

    for (const method of ['GET', 'GET']) {
      const response = await request(url, { method });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      expect(body).not.toContain(before.token);
      expect(body).not.toContain(before.jobId);
      expect(body).toContain('<form method="post">');
    }

    const confirmation = await request(url, { method: 'HEAD' });

    expect(confirmation.status).toBe(200);
    expect(confirmation.headers.get('cache-control')).toBe('no-store');
    expect(confirmation.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await confirmation.text()).toBe('');
    expect((await waits())[0]).toEqual(before);
    expect(await jobs()).toHaveLength(1);

    await sweep();

    expect((await waits())[0]).toEqual(before);

    const response = await request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: '',
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Response recorded');
    expect((await waits())[0]).toMatchObject({ status: 'resumed', data: {}, dispatched: true });
    expect((await post(url, {})).status).toBe(409);
    expect((await request(url)).status).toBe(409);
    expect((await request(url, { method: 'HEAD' })).status).toBe(409);

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect(finished).toHaveBeenCalledExactlyOnceWith({ expired: false, data: {} });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect((await holder(source.id)).completedAt).toEqual(expect.any(String));
  });

  it('a resume link returns 409 after its paused source is deleted', async () => {
    const finished = vi.fn();
    const url = approval(finished);
    const source = await runSource();
    const before = (await waits())[0];

    await fixture.payload.delete({ collection: 'payload-jobs', id: source.id });

    const response = await post(url(), { approved: true });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'WAITPOINT_CONSUMED' } });

    const form = await request(url(), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: '',
    });

    expect(form.status).toBe(409);

    await expect(
      fixture.worker.jobs.resume({ token: before.token, data: { approved: true } }),
    ).rejects.toMatchObject({ status: 409, code: 'WAITPOINT_CONSUMED' });

    await sweep();
    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect((await waits())[0]).toMatchObject({ token: before.token, status: 'pending' });
    expect((await jobs()).filter(({ workflowSlug }) => workflowSlug === 'http-wait')).toEqual([]);
    expect((await jobs()).filter(({ jobId }) => jobId?.startsWith('frogbot-waitpoint:'))).toEqual(
      [],
    );
    expect(finished).not.toHaveBeenCalled();
  });

  it('a duplicate during a resumable wait resolves with the paused workflow', async () => {
    const finished = vi.fn();
    const url = approval(finished);
    const jobId = randomUUID();
    const source = await fixture.frogbot.jobs.queue({
      workflow: 'http-wait',
      jobId,
      input: { requestId: randomUUID() },
    });

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    const paused = await holder(source.id);
    const waiting = (await waits())[0];
    const duplicate = await fixture.worker.jobs.queue({
      workflow: 'http-wait',
      jobId,
      queue: 'ignored-queue',
      input: { requestId: 'ignored-input' },
    });

    expect(duplicate).toMatchObject({
      id: source.id,
      jobId,
      workflowSlug: 'http-wait',
      input: source.input,
      queue: 'approvals',
      waitUntil: waiting.expiresAt,
      completedAt: null,
    });
    expect(await jobs()).toEqual([paused]);
    expect(waiting.holder).toBe(source.id);

    const resumed = await fixture.worker.jobs.resume({
      token: waiting.token,
      data: { approved: true },
    });

    expect(resumed).toEqual({ jobId: source.id });
    expect((await post(url(), {})).status).toBe(409);

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect(finished).toHaveBeenCalledExactlyOnceWith({ expired: false, data: { approved: true } });
    expect(await holder(source.id)).toMatchObject({ id: source.id, jobId });
    expect((await holder(source.id)).completedAt).toEqual(expect.any(String));
  });

  it('the jobId is free after the resumed workflow completes with its row retained', async () => {
    const url = approval();
    const jobId = randomUUID();
    const source = await fixture.frogbot.jobs.queue({ workflow: 'http-wait', jobId, input: {} });

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    expect((await post(url(), {})).status).toBe(200);

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect((await holder(source.id)).completedAt).toEqual(expect.any(String));

    const replacement = await fixture.frogbot.jobs.queue({
      workflow: 'http-wait',
      jobId,
      input: { requestId: randomUUID() },
    });

    expect(replacement.id).not.toBe(source.id);
    expect(await jobs()).toHaveLength(2);
  });

  it('expiry resumes the same row with expired true and keeps the jobId', async () => {
    const now = Date.now();
    const jobId = randomUUID();
    const finished = vi.fn();

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);

    handler = async ({ waitFor }) => {
      finished(await waitFor('approval', { expiresIn: 1000, onWait: () => {} }));
    };

    const source = await fixture.frogbot.jobs.queue({ workflow: 'http-wait', jobId, input: {} });

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    vi.setSystemTime(now + 1000);

    await Promise.all([sweep(), sweep()]);

    expect((await waits())[0]).toMatchObject({
      holder: source.id,
      status: 'expired',
      dispatched: true,
    });
    expect(await holder(source.id)).toMatchObject({
      id: source.id,
      jobId,
      completedAt: null,
      waitUntil: new Date(now + 1000).toISOString(),
    });

    const duplicate = await fixture.worker.jobs.queue({ workflow: 'http-wait', jobId, input: {} });

    expect(duplicate.id).toBe(source.id);

    vi.setSystemTime(now + 1001);

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect(finished).toHaveBeenCalledExactlyOnceWith({ expired: true });
    expect(await holder(source.id)).toMatchObject({ id: source.id, jobId });
    expect((await holder(source.id)).completedAt).toEqual(expect.any(String));
  });

  it('cancelling a paused workflow frees its jobId and its resume link returns 409', async () => {
    const finished = vi.fn();
    const url = approval(finished);
    const jobId = randomUUID();
    const source = await fixture.frogbot.jobs.queue({ workflow: 'http-wait', jobId, input: {} });

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });
    await fixture.worker.jobs.cancelByID({ id: source.id });

    const response = await post(url(), { approved: true });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'WAITPOINT_CONSUMED' } });
    expect(await holder(source.id)).toMatchObject({ id: source.id, jobId, hasError: true });

    const replacement = await fixture.frogbot.jobs.queue({
      workflow: 'http-wait',
      jobId,
      input: {},
    });

    expect(replacement.id).not.toBe(source.id);
    expect(await jobs()).toHaveLength(2);
    expect(finished).not.toHaveBeenCalled();
  });

  it('a supersedes replacement deletes a paused workflow and its token is refused', async () => {
    const finished = vi.fn();
    const url = approval(finished);
    const jobId = randomUUID();
    const key = randomUUID();
    const source = await fixture.frogbot.jobs.queue({
      workflow: 'http-wait-supersede',
      jobId,
      input: { key },
    });

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    const replacement = await fixture.worker.jobs.queue({
      workflow: 'http-wait-supersede',
      jobId,
      input: { key, replacement: true },
    });
    const response = await post(url(), { approved: true });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'WAITPOINT_CONSUMED' } });
    expect(await jobs()).toEqual([
      expect.objectContaining({ id: replacement.id, jobId, input: { key, replacement: true } }),
    ]);
    expect((await holder(replacement.id)).waitUntil).toBeFalsy();
    expect(finished).not.toHaveBeenCalled();
  });

  it('the jobId is free after the resumed workflow fails for good with its row retained', async () => {
    const jobId = randomUUID();
    let url = '';

    handler = async ({ waitFor }) => {
      await waitFor('approval', {
        onWait: ({ resumeUrl }) => {
          url = resumeUrl;
        },
      });

      throw new Error('FrogBot resumed workflow fails for good');
    };

    const source = await fixture.frogbot.jobs.queue({
      workflow: 'http-wait-failure',
      jobId,
      input: {},
    });

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    expect((await post(url, {})).status).toBe(200);

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect(await holder(source.id)).toMatchObject({ id: source.id, jobId, hasError: true });

    const replacement = await fixture.frogbot.jobs.queue({
      workflow: 'http-wait',
      jobId,
      input: {},
    });

    expect(replacement.id).not.toBe(source.id);
    expect(await jobs()).toHaveLength(2);
  });

  it('routes an inbox trigger through its queued handler to local resume', async () => {
    const finished = vi.fn();
    const url = approval(finished);

    const source = await runSource();

    const waiting = (await waits())[0];
    const messageId = randomUUID();
    const response = await request('https://jobs.example.com/custom-api/webhooks/waitpoint-inbox', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-inbox': 'local-reply' },
      body: JSON.stringify({ token: waiting.token, messageId }),
    });

    expect(response.status).toBe(200);
    expect((await waits())[0].status).toBe('pending');

    await fixture.worker.jobs.run({ queue: 'frogbot-trigger:reply-resumer:reply', silent: true });

    expect(triggerContexts).toEqual([
      { piece: 'waitpoint-inbox', trigger: 'reply', agent: 'reply-resumer' },
    ]);
    expect((await waits())[0]).toMatchObject({ status: 'resumed', data: { messageId } });
    expect((await post(url(), { messageId: 'duplicate' })).status).toBe(409);

    await fixture.frogbot.jobs.run({ queue: 'approvals', silent: true });

    expect(finished).toHaveBeenCalledExactlyOnceWith({ expired: false, data: { messageId } });
    expect((await holder(source.id)).completedAt).toEqual(expect.any(String));
  });

  it('buffers concurrent HTTP/local responses until the real callback finishes', async () => {
    const entered = deferred();
    const release = deferred();
    const finished = vi.fn();
    const notify = vi.fn(async () => ({ output: { notified: true } }));
    let url = '';

    handler = async ({ waitFor, inlineTask }) => {
      const result = await waitFor('approval', {
        onWait: async ({ resumeUrl }) => {
          url = resumeUrl;
          entered.resolve();

          await release.promise;
          await inlineTask('notify', { task: notify });
        },
      });

      finished(result);
    };

    const source = runSource();

    activeRuns.push({ release: () => release.resolve(), run: source });

    await entered.promise;

    const before = (await waits())[0];
    const attempts = await Promise.all([
      ...Array.from({ length: 6 }, async (_, index) => (await post(url, { index })).status),
      ...Array.from({ length: 6 }, (_, index) =>
        fixture.worker.jobs.resume({ token: before.token, data: { index } }).then(
          ({ jobId }) => {
            expect(jobId).toBe(before.holder);

            return 200;
          },
          (error: { status: number }) => error.status,
        ),
      ),
    ]);

    expect(attempts.filter((status) => status === 200)).toHaveLength(1);
    expect(attempts.filter((status) => status === 409)).toHaveLength(11);

    await sweep();
    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect((await waits())[0]).toMatchObject({
      ready: false,
      status: 'resumed',
      dispatched: false,
    });
    expect(finished).not.toHaveBeenCalled();

    release.resolve();

    const original = await source;
    const paused = await holder(original.id);

    expect(paused).toMatchObject({
      id: original.id,
      processing: false,
      completedAt: null,
      input: original.input,
      log: [expect.objectContaining({ taskID: 'notify', state: 'succeeded' })],
    });
    expect(Date.parse(paused.waitUntil)).toBeLessThanOrEqual(Date.now());
    expect((await waits())[0]).toMatchObject({ ready: true, dispatched: false });

    await sweep();

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    const waiting = (await waits())[0];

    expect(waiting).toMatchObject({ ready: true, dispatched: true });
    expect((await holder(original.id)).log?.map(({ taskID }) => taskID)).toEqual(['notify']);
    expect(finished).toHaveBeenCalledExactlyOnceWith({ expired: false, data: waiting.data });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('a response accepted while the pausing run is writing returns its holder and is woken by the sweep', async () => {
    const entered = deferred();
    const release = deferred();
    const finished = vi.fn();
    const now = Date.now();

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);

    handler = async ({ waitFor }) => {
      const result = await waitFor('approval', {
        onWait: async () => {
          entered.resolve();

          await release.promise;
        },
      });

      finished(result);
    };

    const source = runSource();

    activeRuns.push({ release: () => release.resolve(), run: source });

    await entered.promise;

    const waiting = (await waits())[0];
    const before = await holder(waiting.holder!);

    expect(before.processing).toBe(true);

    const resumed = await fixture.worker.jobs.resume({
      token: waiting.token,
      data: { approved: true },
    });

    expect(resumed).toEqual({ jobId: before.id });
    expect((await waits())[0]).toMatchObject({
      status: 'resumed',
      ready: false,
      dispatched: false,
    });
    expect(await holder(before.id)).toEqual(before);

    release.resolve();

    const original = await source;

    expect(await holder(original.id)).toMatchObject({
      id: before.id,
      completedAt: null,
      processing: false,
      waitUntil: new Date(now).toISOString(),
    });
    expect((await waits())[0]).toMatchObject({ ready: true, dispatched: false });
    expect(finished).not.toHaveBeenCalled();

    await Promise.all([sweep(), sweep()]);

    expect((await waits())[0]).toMatchObject({ ready: true, dispatched: true });

    vi.setSystemTime(now + 1);

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });
    await fixture.frogbot.jobs.run({ queue: 'approvals', silent: true });

    expect(finished).toHaveBeenCalledExactlyOnceWith({ expired: false, data: { approved: true } });
    expect((await holder(original.id)).completedAt).toEqual(expect.any(String));
  });

  it('retries a failed callback without losing early input, token, deadline or checkpoints', async () => {
    const checkpoint = vi.fn(async () => ({ output: { notified: true } }));
    const urls: string[] = [];
    const finished = vi.fn();

    const notify = vi
      .fn<(resumeUrl: string) => Promise<void>>()
      .mockImplementationOnce(async (resumeUrl) => {
        expect((await post(resumeUrl, { approved: true })).status).toBe(200);

        throw new Error('Callback failed after sending');
      })
      .mockResolvedValue(undefined);

    handler = async ({ waitFor, inlineTask }) => {
      const result = await waitFor('approval', {
        onWait: async ({ resumeUrl }) => {
          urls.push(resumeUrl);

          await inlineTask('notify', { task: checkpoint });

          await notify(resumeUrl);
        },
      });

      finished(result);
    };

    const source = await runSource();
    const before = (await waits())[0];

    expect(before).toMatchObject({ ready: false, status: 'resumed', dispatched: false });
    expect(await holder(source.id)).toMatchObject({
      id: source.id,
      hasError: false,
      log: [expect.objectContaining({ taskID: 'notify', state: 'succeeded' })],
    });
    expect((await holder(source.id)).completedAt).toBeFalsy();

    await sweep();

    expect((await waits())[0].dispatched).toBe(false);

    await fixture.worker.jobs.runByID({ id: source.id, silent: true });

    expect(urls).toEqual([urls[0], urls[0]]);
    expect((await waits())[0]).toMatchObject({
      token: before.token,
      expiresAt: before.expiresAt,
      ready: true,
      dispatched: false,
    });
    expect(await holder(source.id)).toMatchObject({
      id: source.id,
      completedAt: null,
      log: [expect.objectContaining({ taskID: 'notify', state: 'succeeded' })],
    });
    expect(finished).not.toHaveBeenCalled();

    await sweep();

    expect((await waits())[0].dispatched).toBe(true);

    await fixture.frogbot.jobs.run({ queue: 'approvals', silent: true });

    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(finished).toHaveBeenCalledExactlyOnceWith({ expired: false, data: { approved: true } });
    expect((await holder(source.id)).completedAt).toEqual(expect.any(String));
  });

  it('replays approval, delay and expiry by name on the same workflow row', async () => {
    const now = Date.now();
    const until = new Date(now + 60_000);
    const prepare = vi.fn(async () => ({ output: { prepared: true } }));
    const finished = vi.fn();
    const links: string[] = [];

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);

    handler = async ({ inlineTask, waitFor }) => {
      await inlineTask('prepare', { task: prepare });

      const approval = await waitFor('approval', {
        onWait: ({ resumeUrl }) => {
          links.push(resumeUrl);
        },
      });

      await waitFor('cooldown', { until });

      const reply = await waitFor('reply', {
        expiresIn: 1000,
        onWait: ({ resumeUrl }) => {
          links.push(resumeUrl);
        },
      });

      finished({ approval, reply });
    };

    const source = await runSource();

    expect((await post(links[0], 'approved')).status).toBe(200);

    vi.setSystemTime(now + 1);

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect((await waits()).map(({ name }) => name)).toEqual(['approval', 'cooldown']);
    expect((await jobs()).filter(({ completedAt }) => !completedAt)).toEqual([
      expect.objectContaining({ id: source.id, waitUntil: until.toISOString(), totalTried: 0 }),
    ]);
    expect(await holder(source.id)).toMatchObject({
      input: source.input,
      log: [expect.objectContaining({ taskID: 'prepare', state: 'succeeded' })],
    });

    await fixture.payload.delete({
      collection: 'payload-jobs',
      where: { completedAt: { exists: true } },
    });
    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect(links).toHaveLength(1);
    expect(finished).not.toHaveBeenCalled();

    vi.setSystemTime(now + 60_001);

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect((await waits()).map(({ name }) => name)).toEqual(['approval', 'cooldown', 'reply']);
    expect((await waits()).map(({ holder }) => holder)).toEqual([source.id, source.id, source.id]);
    expect(links).toHaveLength(2);
    expect((await holder(source.id)).completedAt).toBeNull();

    vi.setSystemTime(now + 61_001);

    const [late] = await Promise.all([post(links[1], 'too late'), sweep(), sweep()]);

    expect(late.status).toBe(410);
    expect(await late.json()).toMatchObject({ error: { code: 'WAITPOINT_EXPIRED' } });
    expect((await request(links[1], { method: 'HEAD' })).status).toBe(410);

    vi.setSystemTime(now + 61_002);

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect(finished).toHaveBeenCalledExactlyOnceWith({
      approval: { expired: false, data: 'approved' },
      reply: { expired: true },
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(links).toHaveLength(2);
    expect((await holder(source.id)).completedAt).toEqual(expect.any(String));
  });

  it.each([
    { body: '{', contentType: 'application/json', status: 400 },
    { body: '1e400', contentType: 'application/json', status: 400 },
    { body: '{"amount":1e400}', contentType: 'application/json', status: 400 },
    { body: '{}', contentType: 'text/plain', status: 415 },
    { body: 'approved=true', contentType: 'application/x-www-form-urlencoded', status: 400 },
  ])(
    'rejects unsafe HTTP input without consumption: $body ($contentType)',
    async ({ body, contentType, status }) => {
      const url = approval();

      await runSource();

      const before = (await waits())[0];
      const response = await request(url(), {
        method: 'POST',
        headers: { 'content-type': contentType },
        body,
      });

      expect.soft(response.status).toBe(status);
      expect((await waits())[0]).toEqual(before);
      expect(await jobs()).toHaveLength(1);
    },
  );

  it.each(reservedResumeData.map((data) => ({ data })))(
    'rejects reserved JSON keys over HTTP: $data',
    async ({ data }) => {
      const url = approval();

      await runSource();

      const before = (await waits())[0];
      const response = await post(url(), data);

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: 'INVALID_DATA' } });
      expect((await waits())[0]).toEqual(before);
      expect(await jobs()).toHaveLength(1);
      expect(Object.prototype).not.toHaveProperty('approved');
    },
  );

  it('rejects unsafe local values before consumption and round-trips valid JSON through HTTP', async () => {
    const finished = vi.fn();
    const url = approval(finished);

    await runSource();

    const before = (await waits())[0];
    const cycle: { self?: unknown } = {};

    cycle.self = cycle;

    const accessor = Object.defineProperty({}, 'value', {
      enumerable: true,
      get() {
        throw new Error('A resume validator must not invoke a getter');
      },
    });

    for (const data of [
      undefined,
      NaN,
      Infinity,
      1n,
      new Date(),
      cycle,
      new Array(2),
      accessor,
      ...reservedResumeData,
    ]) {
      await expect(fixture.worker.jobs.resume({ token: before.token, data })).rejects.toMatchObject(
        { status: 400 },
      );
    }

    expect((await waits())[0]).toEqual(before);

    const data = { approved: false, data: [null, false, 0, 'reply'] };
    const response = await post(url(), data);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect(finished).toHaveBeenCalledExactlyOnceWith({ expired: false, data });
    expect(Object.prototype).not.toHaveProperty('approved');
  });

  it('returns missing-token errors through both public entry points', async () => {
    const url = 'https://jobs.example.com/custom-api/jobs/missing/resume';

    for (const method of ['GET', 'HEAD']) {
      const response = await request(url, { method });

      expect(response.status).toBe(404);
    }

    expect(await (await request(url, { method: 'HEAD' })).text()).toBe('');

    const response = await post(url, null);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'WAITPOINT_NOT_FOUND' } });

    await expect(
      fixture.worker.jobs.resume({ token: 'missing', data: null }),
    ).rejects.toMatchObject({ status: 404, code: 'WAITPOINT_NOT_FOUND' });

    expect(await waits()).toHaveLength(0);
    expect(await jobs()).toHaveLength(0);
  });

  it('denies collection access and keeps replay credentials out of job reads', async () => {
    const url = approval();

    const source = await runSource();

    const waiting = (await waits())[0];
    const base = 'https://jobs.example.com/custom-api/frogbot-waitpoints';

    for (const [path, method] of [
      [base, 'GET'],
      [`${base}/${waiting.id}`, 'GET'],
      [base, 'POST'],
      [`${base}/${waiting.id}`, 'PATCH'],
      [`${base}/${waiting.id}`, 'DELETE'],
    ]) {
      const response = await request(path, {
        method,
        ...(method === 'POST' || method === 'PATCH'
          ? { headers: { 'content-type': 'application/json' }, body: '{}' }
          : {}),
      });

      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain(waiting.token);
    }

    expect((await waits())[0]).toEqual(waiting);

    expect((await post(url(), {})).status).toBe(200);

    const resumed = await holder(source.id);
    const response = await request(
      `https://jobs.example.com/custom-api/payload-jobs/${resumed.id}`,
    );

    expect(response.status).toBe(403);

    const publicJob = await fixture.payload.findByID({
      collection: 'payload-jobs',
      id: source.id,
    });

    expect(publicJob).not.toHaveProperty('waitpoint');
  });
});

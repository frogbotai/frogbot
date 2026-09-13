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
      workflows: [
        {
          slug: 'http-wait',
          queue: 'approvals',
          retries: { attempts: 3, backoff: { type: 'fixed', delay: 0 } },
          handler: (args) => handler(args),
        },
      ],
    },
  });
});

afterEach(async () => {
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
  it('confirms via the registered router, resumes with the HTML form and survives source deletion', async () => {
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
    expect((await jobs())[0]).toMatchObject({ processing: false, hasError: false, totalTried: 1 });
    expect((await jobs())[0].completedAt).toEqual(expect.any(String));
    expect(finished).not.toHaveBeenCalled();

    for (const method of ['GET', 'HEAD', 'GET']) {
      const response = await request(url, { method });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      expect(body).not.toContain(before.token);
      expect(body).not.toContain(before.jobId);

      if (method === 'HEAD') expect(body).toBe('');
      else expect(body).toContain('<form method="post">');
    }

    expect((await waits())[0]).toEqual(before);
    expect(await jobs()).toHaveLength(1);

    await sweep();

    expect((await waits())[0]).toEqual(before);

    await fixture.payload.delete({ collection: 'payload-jobs', id: source.id });

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
  });

  it('routes an inbox trigger through its queued handler to local resume', async () => {
    const finished = vi.fn();
    const url = approval(finished);

    await runSource();

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

    try {
      await entered.promise;

      const waiting = (await waits())[0];
      const attempts = await Promise.all(
        Array.from({ length: 12 }, async (_, index) => {
          if (index % 2) return (await post(url, { index })).status;

          try {
            await fixture.worker.jobs.resume({ token: waiting.token, data: { index } });

            return 200;
          } catch (error) {
            return (error as { status: number }).status;
          }
        }),
      );

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
    } finally {
      release.resolve();
      await source;
    }

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    const waiting = (await waits())[0];

    expect(waiting).toMatchObject({ ready: true, dispatched: true });
    expect(waiting.snapshot.log?.map(({ taskID }) => taskID)).toEqual(['notify']);
    expect(finished).toHaveBeenCalledExactlyOnceWith({ expired: false, data: waiting.data });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('retries a failed callback without losing early input, token, deadline or checkpoints', async () => {
    const checkpoint = vi.fn(async () => ({ output: { notified: true } }));
    const urls: string[] = [];
    const finished = vi.fn();

    handler = async ({ waitFor, inlineTask }) => {
      const result = await waitFor('approval', {
        onWait: async ({ resumeUrl }) => {
          urls.push(resumeUrl);

          await inlineTask('notify', { task: checkpoint });

          if (urls.length === 1) {
            expect((await post(resumeUrl, { approved: true })).status).toBe(200);

            throw new Error('Callback failed after sending');
          }
        },
      });

      finished(result);
    };

    const source = await runSource();
    const before = (await waits())[0];

    expect(before).toMatchObject({ ready: false, status: 'resumed', dispatched: false });
    expect((await jobs())[0].completedAt).toBeFalsy();

    await sweep();

    expect((await waits())[0].dispatched).toBe(false);

    await fixture.worker.jobs.runByID({ id: source.id, silent: true });

    expect(urls).toEqual([urls[0], urls[0]]);
    expect((await waits())[0]).toMatchObject({
      token: before.token,
      expiresAt: before.expiresAt,
      ready: true,
      dispatched: true,
    });

    await fixture.frogbot.jobs.run({ queue: 'approvals', silent: true });

    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(finished).toHaveBeenCalledExactlyOnceWith({ expired: false, data: { approved: true } });
  });

  it('replays approval, delay and expiry by name across three real continuations', async () => {
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

    await runSource();

    expect((await post(links[0], 'approved')).status).toBe(200);

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect((await waits()).map(({ name }) => name)).toEqual(['approval', 'cooldown']);
    expect((await jobs()).filter(({ completedAt }) => !completedAt)).toEqual([
      expect.objectContaining({ waitUntil: until.toISOString(), totalTried: 0 }),
    ]);

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
    expect(links).toHaveLength(2);

    vi.setSystemTime(now + 61_001);

    const [late] = await Promise.all([post(links[1], 'too late'), sweep(), sweep()]);

    expect(late.status).toBe(410);
    expect(await late.json()).toMatchObject({ error: { code: 'WAITPOINT_EXPIRED' } });
    expect((await request(links[1], { method: 'HEAD' })).status).toBe(410);

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect(finished).toHaveBeenCalledExactlyOnceWith({
      approval: { expired: false, data: 'approved' },
      reply: { expired: true },
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(links).toHaveLength(2);
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

      if (method === 'HEAD') expect(await response.text()).toBe('');
    }

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

    await runSource();

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

    const continuation = (await jobs()).find(
      ({ jobId }) => jobId === `frogbot-waitpoint:${waiting.token}`,
    )!;
    const response = await request(
      `https://jobs.example.com/custom-api/payload-jobs/${continuation.id}`,
    );

    expect(response.status).toBe(403);

    const publicJob = await fixture.payload.findByID({
      collection: 'payload-jobs',
      id: continuation.id,
    });

    expect(publicJob).not.toHaveProperty('waitpoint');
  });
});

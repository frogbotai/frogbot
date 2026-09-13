import { randomUUID } from 'node:crypto';

import { createLocalReq, type Payload, type PayloadRequest } from 'payload';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { WorkflowHandler } from '../../packages/frogbot/dist/jobs/types.js';
import {
  createWaitpoint,
  dispatchWaitpoint,
  findWaitpoint,
  markWaitpointReady,
  resumeWaitpoint,
  sweepWaitpoints,
  WaitpointResumeError,
} from '../../packages/frogbot/dist/jobs/waitpoints/operations.js';
import type { Waitpoint } from '../../packages/frogbot/dist/jobs/waitpoints/types.js';
import { adapterName, bootJobsFixture, deferred } from './fixture.js';

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;
let req: PayloadRequest;
let workerReq: PayloadRequest;
let handler: WorkflowHandler;

beforeAll(async () => {
  fixture = await bootJobsFixture({
    jobs: {
      enableConcurrencyControl: true,
      deleteJobOnComplete: true,
      workflows: [
        {
          slug: 'wait',
          queue: 'approvals',
          concurrency: { key: ({ input }) => String(input.key), supersedes: true },
          handler: (args) => handler(args),
        },
      ],
    },
  });

  req = await createLocalReq({}, fixture.payload);
  workerReq = await createLocalReq({}, fixture.workerPayload);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();

  await fixture.payload.delete({ collection: 'payload-jobs', where: {} });
  await fixture.payload.delete({ collection: 'frogbot-waitpoints', where: {} });
});

afterAll(async () => fixture?.shutdown());

async function point(overrides: Partial<Omit<Waitpoint, 'id'>> = {}) {
  const token = randomUUID();

  return createWaitpoint({
    req,
    data: {
      token,
      jobId: randomUUID(),
      name: 'approval',
      kind: 'resumable',
      status: 'pending',
      ready: true,
      dispatched: false,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      snapshot: {
        workflow: 'wait',
        queue: 'approvals',
        input: { key: token },
        log: [],
      },
      ...overrides,
    },
  });
}

async function continuations(token: string) {
  return fixture.payload.db.find({
    collection: 'payload-jobs',
    where: { jobId: { equals: `frogbot-waitpoint:${token}` } },
    limit: 0,
    pagination: false,
  });
}

function failNextEnqueue(payload: Payload, error: Error) {
  const create = payload.db.create.bind(payload.db);
  let failed = false;

  return vi.spyOn(payload.db, 'create').mockImplementation(async (args) => {
    if (args.collection === 'payload-jobs' && !failed) {
      failed = true;

      throw error;
    }

    return create(args);
  });
}

describe(`durable waitpoints: ${adapterName}`, () => {
  it('consumes parallel resumes once and replays a deleted source snapshot through native enqueue', async () => {
    const prepare = vi.fn(async () => ({ output: { prepared: true } }));
    const notify = vi.fn();
    const results: unknown[] = [];
    let token = '';

    handler = async ({ inlineTask, waitFor, job }) => {
      const prepared = await inlineTask('prepare', { task: prepare });

      expect(prepared).toEqual({ prepared: true });

      const result = await waitFor('approval', {
        onWait: ({ resumeUrl }) => {
          token = new URL(resumeUrl).pathname.split('/')[3];
          notify();
        },
      });

      results.push({ result, input: job.input, meta: job.meta });
    };

    const source = await fixture.frogbot.jobs.queue({
      workflow: 'wait',
      input: { key: 'approval' },
      meta: { origin: 'email' },
    });

    expect(source.queue).toBe('approvals');

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    expect(
      (await fixture.payload.db.find({ collection: 'payload-jobs', where: {}, limit: 0 })).docs,
    ).toHaveLength(0);

    const attempts = await Promise.allSettled(
      Array.from({ length: 12 }, (_, index) =>
        (index % 2 ? fixture.frogbot : fixture.worker).jobs.resume({ token, data: { index } }),
      ),
    );

    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);

    for (const attempt of attempts) {
      if (attempt.status === 'rejected') {
        expect(attempt.reason).toBeInstanceOf(WaitpointResumeError);
        expect(attempt.reason.status).toBe(409);
      }
    }

    const stored = (await findWaitpoint({ req, token }))!;
    const queued = await continuations(token);

    expect(queued.docs).toHaveLength(1);
    expect(stored.dispatched).toBe(true);
    expect(queued.docs[0]).toMatchObject({
      queue: 'approvals',
      concurrencyKey: 'approval',
      input: { key: 'approval' },
      meta: { origin: 'email' },
      waitpoint: {
        jobId: stored.jobId,
        results: { approval: { expired: false, data: stored.data } },
      },
    });

    await fixture.worker.jobs.runByID({ id: queued.docs[0].id, silent: true });

    expect(prepare).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      {
        result: { expired: false, data: stored.data },
        input: { key: 'approval' },
        meta: { origin: 'email' },
      },
    ]);
    expect((await continuations(token)).docs).toHaveLength(0);

    await Promise.all([
      dispatchWaitpoint({ req, waitpoint: { ...stored, dispatched: false } }),
      sweepWaitpoints({ req: workerReq }),
    ]);

    expect((await continuations(token)).docs).toHaveLength(0);
    expect((await findWaitpoint({ req, token }))?.dispatched).toBe(true);
  });

  it('buffers an early response, preserves it at readiness, and recovers failed dispatch', async () => {
    const waiting = await point({ ready: false });
    const response = { approved: true };

    await expect(
      fixture.worker.jobs.resume({ token: waiting.token, data: response }),
    ).resolves.toEqual({});

    response.approved = false;

    const snapshot = { ...waiting.snapshot, meta: { notified: true } };

    await markWaitpointReady({ req, waitpoint: waiting, snapshot });

    const ready = (await findWaitpoint({ req, token: waiting.token }))!;

    expect(ready).toMatchObject({
      ready: true,
      status: 'resumed',
      data: { approved: true },
      snapshot,
    });

    const failure = new Error('queue is unavailable');
    const create = failNextEnqueue(fixture.payload, failure);

    await expect(dispatchWaitpoint({ req, waitpoint: ready })).rejects.toBe(failure);

    expect((await findWaitpoint({ req, token: waiting.token }))?.dispatched).toBe(false);
    expect((await continuations(waiting.token)).docs).toHaveLength(0);

    create.mockRestore();

    await sweepWaitpoints({ req: workerReq });

    expect((await continuations(waiting.token)).docs).toHaveLength(1);
    expect((await findWaitpoint({ req, token: waiting.token }))?.dispatched).toBe(true);
  });

  it('seeds inline logs while the source still exists and preserves callback checkpoints', async () => {
    const prepare = vi.fn(async () => ({ output: { prepared: true } }));
    const notify = vi.fn(async () => ({ output: { sent: true } }));
    const finished = vi.fn();
    let token = '';

    handler = async ({ inlineTask, waitFor }) => {
      await inlineTask('prepare', { task: prepare });

      const result = await waitFor('approval', {
        onWait: async ({ resumeUrl }) => {
          token = new URL(resumeUrl).pathname.split('/')[3];

          await expect(fixture.worker.jobs.resume({ token, data: 'approved' })).resolves.toEqual(
            {},
          );

          await inlineTask('notify', { task: notify });
        },
      });

      finished(result);
    };

    const source = await fixture.frogbot.jobs.queue({ workflow: 'wait', input: { key: 'early' } });

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    const waiting = (await findWaitpoint({ req, token }))!;
    const sourceAfter = await fixture.payload.db.find({
      collection: 'payload-jobs',
      where: { id: { equals: source.id } },
      limit: 1,
    });

    expect(sourceAfter.docs[0]?.error).toBeUndefined();
    expect(waiting).toMatchObject({ status: 'resumed', ready: true, dispatched: true });
    expect(waiting.snapshot.log?.map(({ taskID }) => taskID)).toEqual(['prepare', 'notify']);

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect(prepare).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(finished).toHaveBeenCalledExactlyOnceWith({ expired: false, data: 'approved' });
  });

  it('isolates new workflows when SQLite recycles a deleted primary job ID', async () => {
    const notifications: string[] = [];

    handler = async ({ waitFor }) => {
      await waitFor('approval', {
        onWait: ({ resumeUrl }) => {
          notifications.push(new URL(resumeUrl).pathname.split('/')[3]);
        },
      });
    };

    const first = await fixture.frogbot.jobs.queue({ workflow: 'wait', input: { key: 'first' } });

    await fixture.frogbot.jobs.runByID({ id: first.id, silent: true });

    const second = await fixture.frogbot.jobs.queue({ workflow: 'wait', input: { key: 'second' } });

    await fixture.frogbot.jobs.runByID({ id: second.id, silent: true });

    if (adapterName === 'sqlite') expect(second.id).toBe(first.id);

    expect(notifications).toHaveLength(2);
    expect(notifications[0]).not.toBe(notifications[1]);

    const firstWait = await findWaitpoint({ req, token: notifications[0] });
    const secondWait = await findWaitpoint({ req, token: notifications[1] });

    expect(firstWait?.jobId).not.toBe(secondWait?.jobId);
    expect(firstWait?.snapshot.input).toEqual({ key: 'first' });
    expect(secondWait?.snapshot.input).toEqual({ key: 'second' });
  });

  it('serializes overlapping creator and sweep dispatches even with native supersedes', async () => {
    const waiting = await point({ status: 'resumed', data: 'accepted' });
    const entered = deferred();
    const release = deferred();
    const create = fixture.payload.db.create.bind(fixture.payload.db);
    const blocked = vi.spyOn(fixture.payload.db, 'create').mockImplementation(async (args) => {
      if (args.collection === 'payload-jobs') {
        entered.resolve();

        await release.promise;
      }

      return create(args);
    });

    const first = dispatchWaitpoint({ req, waitpoint: waiting });

    try {
      await entered.promise;

      await Promise.all([
        sweepWaitpoints({ req: workerReq }),
        ...Array.from({ length: 8 }, () =>
          dispatchWaitpoint({ req: workerReq, waitpoint: waiting }),
        ),
      ]);

      expect((await continuations(waiting.token)).docs).toHaveLength(0);
    } finally {
      release.resolve();
    }

    await first;

    expect(blocked).toHaveBeenCalledTimes(1);
    expect((await continuations(waiting.token)).docs).toHaveLength(1);
    expect((await findWaitpoint({ req, token: waiting.token }))?.dispatched).toBe(true);
  });

  it('recovers an abandoned dispatch claim without creating a second continuation', async () => {
    const waiting = await point({ status: 'resumed', data: 'accepted' });

    await dispatchWaitpoint({ req, waitpoint: waiting });

    const before = await continuations(waiting.token);

    await fixture.payload.db.updateOne({
      collection: 'frogbot-waitpoints',
      id: waiting.id,
      data: {
        dispatched: false,
        dispatchOwner: 'crashed-worker',
        dispatchLeaseUntil: new Date(Date.now() - 1000).toISOString(),
      },
    });

    await sweepWaitpoints({ req: workerReq });

    const after = await continuations(waiting.token);

    expect(after.docs).toHaveLength(1);
    expect(after.docs[0].id).toBe(before.docs[0].id);
    expect((await findWaitpoint({ req, token: waiting.token }))?.dispatched).toBe(true);
  });

  it('lets native supersedes replace pending work and leaves failed replacement retryable', async () => {
    const waiting = await point({ status: 'resumed', data: 'accepted' });
    const replaced = await fixture.frogbot.jobs.queue({
      workflow: 'wait',
      input: waiting.snapshot.input,
    });
    const failure = new Error('replacement insert failed');
    const create = failNextEnqueue(fixture.payload, failure);

    await expect(dispatchWaitpoint({ req, waitpoint: waiting })).rejects.toBe(failure);

    expect(
      (
        await fixture.payload.db.find({
          collection: 'payload-jobs',
          where: { id: { equals: replaced.id } },
          limit: 1,
        })
      ).docs,
    ).toHaveLength(0);
    expect((await findWaitpoint({ req, token: waiting.token }))?.dispatched).toBe(false);

    create.mockRestore();

    await sweepWaitpoints({ req: workerReq });

    expect((await continuations(waiting.token)).docs).toHaveLength(1);
  });

  it('expires exactly at the deadline and permits only the atomic response-or-expiry winner', async () => {
    const now = Date.now();
    const future = await point({ expiresAt: new Date(now + 10_000).toISOString() });
    const due = await point({ expiresAt: new Date(now).toISOString() });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);

    const attempts = await Promise.allSettled([
      resumeWaitpoint({ req, token: due.token, data: 'late' }),
      sweepWaitpoints({ req: workerReq }),
    ]);

    expect(attempts[0]).toMatchObject({
      status: 'rejected',
      reason: { status: 410, code: 'WAITPOINT_EXPIRED' },
    });
    expect(attempts[1].status).toBe('fulfilled');

    const expired = (await continuations(due.token)).docs;

    expect(expired).toHaveLength(1);
    expect(expired[0]).toMatchObject({ waitpoint: { results: { approval: { expired: true } } } });
    expect((await findWaitpoint({ req, token: future.token }))?.status).toBe('pending');

    await resumeWaitpoint({ req, token: future.token, data: 'on time' });

    await fixture.payload.db.updateOne({
      collection: 'frogbot-waitpoints',
      id: future.id,
      data: { expiresAt: new Date(now - 1000).toISOString() },
    });

    await sweepWaitpoints({ req });

    expect((await findWaitpoint({ req, token: future.token }))?.status).toBe('resumed');
    await expect(
      resumeWaitpoint({ req, token: future.token, data: 'again' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('schedules a delay without early execution and restores prior named results', async () => {
    const until = new Date(Date.now() + 60_000).toISOString();
    const completed = vi.fn();
    const waiting = await point({
      name: 'cooldown',
      kind: 'delay',
      until,
      expiresAt: undefined,
      snapshot: {
        workflow: 'wait',
        queue: 'approvals',
        input: { key: 'delay' },
        log: [],
        results: { approval: { expired: false, data: 'yes' } },
      },
    });

    handler = async ({ waitFor }) => {
      expect(
        await waitFor('approval', {
          onWait: () => {
            throw new Error('Replayed notification');
          },
        }),
      ).toEqual({ expired: false, data: 'yes' });

      await waitFor('cooldown', { until });

      completed();
    };

    await Promise.all([
      dispatchWaitpoint({ req, waitpoint: waiting }),
      sweepWaitpoints({ req: workerReq }),
    ]);

    const queued = (await continuations(waiting.token)).docs;

    expect(queued).toHaveLength(1);
    expect(queued[0].waitUntil).toBe(until);

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect(completed).not.toHaveBeenCalled();

    await fixture.payload.db.updateOne({
      collection: 'payload-jobs',
      id: queued[0].id,
      data: { waitUntil: new Date(Date.now() - 1000).toISOString() },
    });

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect(completed).toHaveBeenCalledTimes(1);
  });

  it('does not mask unrelated queue failures as duplicate dispatch success', async () => {
    const waiting = await point({ status: 'resumed', data: null });
    const failure = new Error('not a unique constraint error');

    failNextEnqueue(fixture.payload, failure);

    await expect(dispatchWaitpoint({ req, waitpoint: waiting })).rejects.toBe(failure);

    expect((await findWaitpoint({ req, token: waiting.token }))?.dispatched).toBe(false);
  });

  it('uses FrogBot requests and returns stable missing-token errors', async () => {
    const waiting = await point({ ready: false });
    const localReq = await fixture.frogbot.createRequest({ context: { origin: 'trigger' } });

    await expect(
      fixture.frogbot.jobs.resume({ token: waiting.token, data: null, req: localReq }),
    ).resolves.toEqual({});
    await expect(resumeWaitpoint({ req, token: 'missing', data: null })).rejects.toMatchObject({
      status: 404,
      code: 'WAITPOINT_NOT_FOUND',
    });
  });

  it('sweeps beyond a full page without skipping rows removed from the pending set', async () => {
    const waits = await Promise.all(
      Array.from({ length: 101 }, () =>
        point({
          status: 'resumed',
          data: { approved: true },
        }),
      ),
    );

    await sweepWaitpoints({ req: workerReq });

    const undispatched = await fixture.payload.db.find({
      collection: 'frogbot-waitpoints',
      where: { dispatched: { equals: false } },
      limit: 0,
    });
    const jobs = await fixture.payload.db.find({ collection: 'payload-jobs', where: {}, limit: 0 });

    expect(undispatched.docs).toHaveLength(0);
    expect(jobs.docs).toHaveLength(waits.length);
  });

  it('continues recovery after one dispatch fails and retries that wait on the next sweep', async () => {
    const first = await point({ status: 'resumed', data: { accepted: true } });
    const second = await point({ status: 'resumed', data: { accepted: true } });
    const failure = new Error('temporary enqueue failure');
    const create = failNextEnqueue(fixture.payload, failure);

    await expect(sweepWaitpoints({ req })).rejects.toMatchObject({ errors: [failure] });

    expect((await findWaitpoint({ req, token: first.token }))?.dispatched).toBe(false);
    expect((await findWaitpoint({ req, token: second.token }))?.dispatched).toBe(true);

    create.mockRestore();

    await sweepWaitpoints({ req: workerReq });

    expect((await continuations(first.token)).docs).toHaveLength(1);
    expect((await continuations(second.token)).docs).toHaveLength(1);
  });

  it('rejects cyclic, sparse, and accessor-backed resume values before consumption', async () => {
    const waiting = await point({ ready: false });
    const cycle: { self?: unknown } = {};

    cycle.self = cycle;

    const accessor = Object.defineProperty({}, 'data', { enumerable: true, get: () => 'value' });

    for (const data of [cycle, new Array(2), accessor]) {
      await expect(resumeWaitpoint({ req, token: waiting.token, data })).rejects.toMatchObject({
        status: 400,
      });
    }

    expect((await findWaitpoint({ req, token: waiting.token }))?.status).toBe('pending');
  });

  it.each([
    undefined,
    BigInt(1),
    NaN,
    Infinity,
    { invalid: undefined },
    [undefined],
    new Date(),
    () => null,
    Symbol('data'),
  ])('rejects non-JSON resume data before consumption: %s', async (data) => {
    const waiting = await point({ ready: false });

    await expect(resumeWaitpoint({ req, token: waiting.token, data })).rejects.toMatchObject({
      status: 400,
    });

    expect((await findWaitpoint({ req, token: waiting.token }))?.status).toBe('pending');
  });
});

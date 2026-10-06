import { randomUUID } from 'node:crypto';

import type { DrizzleAdapter } from '@payloadcms/drizzle';
import { sweepJobLeases } from 'frogbot/jobs';
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
} from '../../packages/frogbot/dist/jobs/waitpoints/operations.js';
import type { Waitpoint } from '../../packages/frogbot/dist/jobs/waitpoints/types.js';
import { adapterName, bootJobsFixture, deferred, type FrogBotJob, timestamp } from './fixture.js';

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;
let req: PayloadRequest;
let workerReq: PayloadRequest;
let handler: WorkflowHandler;

const releases: (() => void)[] = [];
const inFlight: Promise<unknown>[] = [];

type WakeSQLWriter = {
  update: (table: unknown) => {
    set: (data: Record<string, unknown>) => {
      where: (where: unknown) => {
        returning: (fields: unknown) => PromiseLike<unknown[]>;
      };
    };
  };
};

beforeAll(async () => {
  fixture = await bootJobsFixture({
    jobs: {
      deleteJobOnComplete: true,
      workflows: [
        {
          slug: 'wait',
          retries: 0,
          queue: 'approvals',
          concurrency: { key: ({ input }) => String(input.key), supersedes: true },
          handler: (args) => handler(args),
        },
        {
          slug: 'scheduled-wait',
          queue: 'scheduled-approvals',
          schedule: [{ cron: '* * * * *', queue: 'scheduled-approvals' }],
          handler: (args) => handler(args),
        },
        {
          slug: 'complete',
          queue: 'approvals',
          handler: async () => {},
        },
      ],
    },
  });

  req = await createLocalReq({}, fixture.payload);
  workerReq = await createLocalReq({}, fixture.workerPayload);
});

afterEach(async () => {
  for (const release of releases.splice(0)) release();

  await Promise.allSettled(inFlight.splice(0));

  vi.restoreAllMocks();
  vi.useRealTimers();

  await fixture.payload.db.deleteMany({ collection: 'payload-jobs', where: {} });
  await fixture.payload.db.deleteMany({ collection: 'frogbot-waitpoints', where: {} });
});

afterAll(async () => fixture?.shutdown());

async function point(overrides: Partial<Omit<Waitpoint, 'id'>> = {}) {
  const token = randomUUID();
  const jobId = overrides.jobId ?? randomUUID();
  const expiresAt = overrides.expiresAt ?? new Date(Date.now() + 60_000).toISOString();

  const holder = await fixture.payload.db.create({
    collection: 'payload-jobs',
    data: {
      workflowSlug: 'wait',
      queue: 'approvals',
      input: { key: token },
      processing: false,
      hasError: false,
      completedAt: null,
      waitUntil: expiresAt,
      waitpoint: { jobId, results: {}, waiting: overrides.name ?? 'approval' },
    },
  });

  return createWaitpoint({
    req,
    data: {
      token,
      jobId,
      holder: holder.id,
      name: 'approval',
      kind: 'resumable',
      status: 'pending',
      ready: true,
      dispatched: false,
      expiresAt,
      ...overrides,
    },
  });
}

async function holder(waitpoint: Waitpoint) {
  const result = await fixture.payload.db.find<FrogBotJob>({
    collection: 'payload-jobs',
    where: { id: { equals: waitpoint.holder } },
    limit: 1,
    pagination: false,
  });

  return result.docs[0];
}

async function expectNoContinuationJobs() {
  const jobs = await fixture.payload.db.find<FrogBotJob>({ collection: 'payload-jobs', limit: 0 });

  expect(jobs.docs.filter(({ jobId }) => jobId?.startsWith('frogbot-waitpoint:'))).toEqual([]);
}

function mockWake(payload: Payload, beforeWrite: () => Promise<void>) {
  if (payload.db.name === 'mongoose') {
    const updateOne = payload.db.updateOne.bind(payload.db);

    return vi.spyOn(payload.db, 'updateOne').mockImplementation(async (args) => {
      if (args.collection === 'payload-jobs' && Object.hasOwn(args.data, 'waitUntil')) {
        await beforeWrite();
      }

      return updateOne(args);
    });
  }

  const adapter = payload.db as unknown as DrizzleAdapter;
  const drizzle = (adapter.primaryDrizzle ?? adapter.drizzle) as unknown as WakeSQLWriter;
  const update = drizzle.update.bind(drizzle);
  const table = adapter.tables[adapter.tableNameMap.get('payload_jobs')!];

  return vi.spyOn(drizzle, 'update').mockImplementation((target) => {
    const query = update(target);

    if (target !== table) return query;

    return {
      set(data: Record<string, unknown>) {
        const builder = query.set(data);

        if (!Object.hasOwn(data, 'waitUntil')) return builder;

        return {
          where(where: unknown) {
            const filtered = builder.where(where);

            return {
              async returning(fields: unknown) {
                await beforeWrite();

                return filtered.returning(fields);
              },
            };
          },
        };
      },
    };
  });
}

function failNextWake(payload: Payload, error: Error) {
  let failed = false;

  return mockWake(payload, () => {
    if (failed) return Promise.resolve();

    failed = true;

    return Promise.reject(error);
  });
}

function interceptCompletion(
  payload: Payload,
  id: number | string,
  beforeWrite: () => Promise<void>,
) {
  const updateJobs = payload.db.updateJobs.bind(payload.db);

  return vi.spyOn(payload.db, 'updateJobs').mockImplementation(async (args) => {
    if (args.id === id && args.data.completedAt) await beforeWrite();

    return updateJobs(args);
  });
}

async function pausedWorkflow(jobId: string, onResume: (result: unknown) => void = () => {}) {
  let token = '';

  handler = async ({ waitFor }) => {
    const result = await waitFor('approval', {
      onWait: ({ resumeUrl }) => {
        token = new URL(resumeUrl).pathname.split('/')[3];
      },
    });

    onResume(result);
  };

  const source = await fixture.frogbot.jobs.queue({
    workflow: 'wait',
    input: { key: jobId },
    jobId,
  });

  await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

  const waiting = (await findWaitpoint({ req, token }))!;

  return { source, waiting, token };
}

describe(`durable waitpoints: ${adapterName}`, () => {
  it('a duplicate during a resumable wait resolves with the paused workflow', async () => {
    const { source, waiting } = await pausedWorkflow('resumable-duplicate');

    const duplicate = await fixture.worker.jobs.queue({
      task: 'fail-for-good',
      input: { ignored: true },
      queue: 'different',
      jobId: 'resumable-duplicate',
    });
    const jobs = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      limit: 0,
    });

    expect(duplicate).toMatchObject({
      id: source.id,
      workflowSlug: 'wait',
      input: source.input,
      queue: 'approvals',
      waitUntil: waiting.expiresAt,
      completedAt: null,
      hasError: false,
      processing: false,
    });
    expect(jobs.docs).toHaveLength(1);
    expect(waiting.holder).toBe(source.id);
    await expectNoContinuationJobs();
  });

  it('runByID reruns a paused resumable wait without freeing its jobId', async () => {
    const finished = vi.fn();
    const { source, waiting } = await pausedWorkflow('forced-resumable', finished);
    const before = await holder(waiting);

    await fixture.worker.jobs.runByID({ id: source.id, silent: true });

    const after = await holder(waiting);
    const duplicate = await fixture.frogbot.jobs.queue({
      workflow: 'wait',
      input: { key: 'ignored' },
      jobId: 'forced-resumable',
    });

    expect(after).toMatchObject({
      id: source.id,
      waitUntil: before.waitUntil,
      processing: false,
      hasError: false,
      completedAt: null,
      totalTried: 0,
    });
    expect(duplicate.id).toBe(source.id);
    expect(await findWaitpoint({ req, token: waiting.token })).toEqual(waiting);
    expect(finished).not.toHaveBeenCalled();
  });

  it('expiry resumes the same row with expired true and keeps the jobId', async () => {
    const now = Date.now();
    const runs: unknown[] = [];
    const notify = vi.fn();
    let token = '';

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);

    handler = async ({ waitFor, job }) => {
      const result = await waitFor('approval', {
        expiresIn: 60_000,
        onWait: ({ resumeUrl }) => {
          token = new URL(resumeUrl).pathname.split('/')[3];
          notify();
        },
      });

      runs.push({ id: job.id, jobId: (job as FrogBotJob).jobId, result });

      await waitFor('cooldown', { until: new Date(now + 120_000) });
    };

    const source = await fixture.frogbot.jobs.queue({
      workflow: 'wait',
      input: { key: 'expiring' },
      jobId: 'expiring',
    });

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    vi.setSystemTime(now + 60_001);

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    const waiting = (await findWaitpoint({ req, token }))!;
    const stored = await holder(waiting);
    const duplicate = await fixture.frogbot.jobs.queue({
      workflow: 'wait',
      input: { key: 'ignored' },
      jobId: 'expiring',
    });

    expect(runs).toEqual([{ id: source.id, jobId: 'expiring', result: { expired: true } }]);
    expect(waiting).toMatchObject({ holder: source.id, status: 'expired' });
    expect(stored).toMatchObject({
      id: source.id,
      jobId: 'expiring',
      completedAt: null,
      hasError: false,
      waitUntil: new Date(now + 120_000).toISOString(),
    });
    expect(duplicate.id).toBe(source.id);
    expect(notify).toHaveBeenCalledTimes(1);
    await expectNoContinuationJobs();
  });

  it('a crash before the re-arm write recovers the same live holder and existing waitpoint', async () => {
    const entered = deferred();
    const release = deferred();
    const notify = vi.fn();
    const finished = vi.fn();
    let token = '';

    releases.push(release.resolve);

    vi.useFakeTimers({ toFake: ['Date'] });

    handler = async ({ waitFor }) => {
      const result = await waitFor('approval', {
        onWait: ({ resumeUrl }) => {
          token = new URL(resumeUrl).pathname.split('/')[3];
          notify();
        },
      });

      finished(result);
    };

    const source = await fixture.frogbot.jobs.queue({
      workflow: 'wait',
      input: { key: 'crashed-pause' },
      jobId: 'crashed-pause',
    });

    const blocked = interceptCompletion(fixture.payload, source.id, async () => {
      entered.resolve();

      await release.promise;

      throw new Error('FrogBot crashed worker loses its database connection');
    });

    const run = fixture.frogbot.jobs.runByID({ id: source.id, silent: true });
    const settled = Promise.allSettled([run]);

    inFlight.push(settled);

    await Promise.race([
      entered.promise,
      run.then(() => {
        throw new Error('FrogBot run finishes without reaching the pausing write');
      }),
    ]);

    const waiting = (await findWaitpoint({ req, token }))!;
    const processing = await holder(waiting);

    expect(processing).toMatchObject({ id: source.id, processing: true, completedAt: null });

    vi.setSystemTime(timestamp(processing.leaseUntil) + 1);

    await sweepJobLeases({ req: workerReq });

    expect((await holder(waiting)).processing).toBe(false);
    expect(
      (
        await fixture.worker.jobs.queue({
          task: 'record-effect',
          input: undefined,
          jobId: 'crashed-pause',
        })
      ).id,
    ).toBe(source.id);

    await fixture.worker.jobs.runByID({ id: source.id, silent: true });

    const recovered = await holder(waiting);
    const waits = await fixture.payload.db.find({ collection: 'frogbot-waitpoints', limit: 0 });

    expect(recovered).toMatchObject({
      id: source.id,
      processing: false,
      completedAt: null,
      hasError: false,
      waitUntil: waiting.expiresAt,
    });
    expect(waits.docs).toHaveLength(1);
    expect(waits.docs[0]).toMatchObject({ id: waiting.id, holder: source.id, token });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(finished).not.toHaveBeenCalled();

    release.resolve();

    await settled;

    blocked.mockRestore();

    expect(await holder(waiting)).toEqual(recovered);
    await expectNoContinuationJobs();
  });

  it('a mixed batch deletes only its completed job and preserves its paused holder', async () => {
    handler = async ({ waitFor }) => {
      await waitFor('approval', { onWait: () => {} });
    };

    const paused = await fixture.frogbot.jobs.queue({
      workflow: 'wait',
      input: { key: 'mixed-batch' },
      jobId: 'mixed-batch',
    });
    const completed = await fixture.frogbot.jobs.queue({ workflow: 'complete', input: {} });

    await fixture.worker.jobs.run({ queue: 'approvals', limit: 2, silent: true });

    const rows = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      limit: 0,
    });
    const waits = await fixture.payload.db.find({ collection: 'frogbot-waitpoints', limit: 0 });

    expect(rows.docs).toHaveLength(1);
    expect(rows.docs[0]).toMatchObject({
      id: paused.id,
      completedAt: null,
      hasError: false,
      processing: false,
    });
    expect(rows.docs.map(({ id }) => id)).not.toContain(completed.id);
    expect(waits.docs).toHaveLength(1);
    expect(waits.docs[0]).toMatchObject({ holder: paused.id, status: 'pending' });
  });

  it('a response accepted while the pausing run is writing is woken by the sweep', async () => {
    const entered = deferred();
    const release = deferred();
    const finished = vi.fn();
    let token = '';

    releases.push(release.resolve);

    handler = async ({ waitFor }) => {
      const result = await waitFor('approval', {
        onWait: ({ resumeUrl }) => {
          token = new URL(resumeUrl).pathname.split('/')[3];
        },
      });

      finished(result);
    };

    const source = await fixture.frogbot.jobs.queue({
      workflow: 'wait',
      input: { key: 'writing' },
      jobId: 'writing',
    });
    const blocked = interceptCompletion(fixture.payload, source.id, async () => {
      entered.resolve();

      await release.promise;
    });
    const run = fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    inFlight.push(run);

    await entered.promise;

    await expect(fixture.worker.jobs.resume({ token, data: 'accepted' })).resolves.toEqual({
      jobId: source.id,
    });

    const accepted = (await findWaitpoint({ req, token }))!;

    expect(accepted).toMatchObject({ status: 'resumed', ready: true, dispatched: false });
    expect((await holder(accepted)).processing).toBe(true);

    release.resolve();

    await run;

    blocked.mockRestore();

    expect((await holder(accepted)).waitUntil).toBe(accepted.expiresAt);

    await sweepWaitpoints({ req: workerReq });

    expect((await findWaitpoint({ req, token }))?.dispatched).toBe(true);
    expect(timestamp((await holder(accepted)).waitUntil)).toBeLessThanOrEqual(Date.now());

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect(finished).toHaveBeenCalledExactlyOnceWith({ expired: false, data: 'accepted' });
    expect(await holder(accepted)).toBeUndefined();
    await expectNoContinuationJobs();
  });

  it('cancelling a paused workflow frees its jobId and its resume link returns 409', async () => {
    const { source, waiting, token } = await pausedWorkflow('cancelled-paused');

    await fixture.frogbot.jobs.cancelByID({ id: source.id });

    const replacement = await fixture.worker.jobs.queue({
      task: 'fail-for-good',
      input: {},
      jobId: 'cancelled-paused',
    });

    await expect(fixture.frogbot.jobs.resume({ token, data: 'late' })).rejects.toMatchObject({
      status: 409,
      code: 'WAITPOINT_CONSUMED',
    });

    expect(replacement.id).not.toBe(source.id);
    expect((await holder(waiting)).hasError).toBe(true);
    expect((await findWaitpoint({ req, token }))?.status).toBe('pending');
    expect((await findWaitpoint({ req, token }))?.data).toBeFalsy();
    await expectNoContinuationJobs();
  });

  it('the jobId is free after the resumed workflow completes', async () => {
    const finished = vi.fn();
    const { source, token, waiting } = await pausedWorkflow('resumed-complete', finished);

    await fixture.worker.jobs.resume({ token, data: 'yes' });
    await fixture.worker.jobs.runByID({ id: source.id, silent: true });

    const replacement = await fixture.frogbot.jobs.queue({
      task: 'fail-for-good',
      input: {},
      jobId: 'resumed-complete',
    });

    expect(finished).toHaveBeenCalledExactlyOnceWith({ expired: false, data: 'yes' });
    expect(replacement).toMatchObject({ jobId: 'resumed-complete', taskSlug: 'fail-for-good' });
    expect((await holder(waiting))?.workflowSlug).not.toBe('wait');
    await expectNoContinuationJobs();
  });

  it('a resumed workflow runs in the same millisecond it was woken', async () => {
    const finished = vi.fn();
    const { token } = await pausedWorkflow('resumed-same-millisecond', finished);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now());

    await fixture.worker.jobs.resume({ token, data: 'yes' });
    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect(finished).toHaveBeenCalledExactlyOnceWith({ expired: false, data: 'yes' });
  });

  it('a workflow answered before it paused runs in the same millisecond it paused', async () => {
    const finished = vi.fn();

    handler = async ({ waitFor }) => {
      finished(
        await waitFor('approval', {
          onWait: async ({ resumeUrl }) => {
            const token = new URL(resumeUrl).pathname.split('/')[3];

            await fixture.worker.jobs.resume({ token, data: 'early' });
          },
        }),
      );
    };

    const source = await fixture.frogbot.jobs.queue({
      workflow: 'wait',
      input: { key: 'early-same-millisecond' },
    });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now());

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });
    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect(finished).toHaveBeenCalledExactlyOnceWith({ expired: false, data: 'early' });
  });

  it('the jobId is free after the resumed workflow fails for good', async () => {
    const failure = new Error('resumed workflow failed');
    const { source, token, waiting } = await pausedWorkflow('resumed-failure', () => {
      throw failure;
    });

    await fixture.worker.jobs.resume({ token, data: 'yes' });
    await fixture.worker.jobs.runByID({ id: source.id, silent: true });

    const failed = await holder(waiting);
    const replacement = await fixture.frogbot.jobs.queue({
      task: 'fail-for-good',
      input: {},
      jobId: 'resumed-failure',
    });

    expect(failed).toMatchObject({ id: source.id, hasError: true });
    expect(replacement.id).not.toBe(source.id);
    expect(replacement).toMatchObject({ jobId: 'resumed-failure' });
    await expectNoContinuationJobs();
  });

  it('the jobId is free after the resumed workflow is cancelled', async () => {
    const { source, token, waiting } = await pausedWorkflow('resumed-cancel');

    await fixture.worker.jobs.resume({ token, data: 'yes' });
    await fixture.frogbot.jobs.cancelByID({ id: source.id });

    const replacement = await fixture.worker.jobs.queue({
      task: 'fail-for-good',
      input: {},
      jobId: 'resumed-cancel',
    });

    expect((await holder(waiting)).hasError).toBe(true);
    expect(replacement.id).not.toBe(source.id);
    expect(replacement).toMatchObject({ jobId: 'resumed-cancel' });
    await expectNoContinuationJobs();
  });

  it('a deleted holder never wakes the job that reuses its id', async () => {
    const { source, token } = await pausedWorkflow('deleted-holder');

    await fixture.payload.delete({ collection: 'payload-jobs', id: source.id });

    const until = new Date(Date.now() + 120_000).toISOString();
    const replacement = await fixture.worker.jobs.queue({
      workflow: 'wait',
      input: { key: 'replacement-holder' },
      jobId: 'deleted-holder',
      waitUntil: new Date(until),
    });

    const before = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      limit: 0,
    });

    await expect(fixture.frogbot.jobs.resume({ token, data: 'old' })).rejects.toMatchObject({
      status: 409,
      code: 'WAITPOINT_CONSUMED',
    });

    const waiting = (await findWaitpoint({ req, token }))!;

    expect(replacement.id).toEqual(adapterName === 'sqlite' ? source.id : expect.anything());
    expect(waiting.holder).toBe(adapterName === 'mongodb' ? source.id : null);
    expect(waiting.status).toBe('pending');
    expect(
      (await fixture.payload.db.find<FrogBotJob>({ collection: 'payload-jobs', limit: 0 })).docs,
    ).toEqual(before.docs);
    expect(before.docs[0].waitUntil).toBe(until);
    await expectNoContinuationJobs();
  });

  it('a holder carrying another workflow run refuses the token before consumption', async () => {
    const waiting = await point();
    const until = (await holder(waiting)).waitUntil;

    await fixture.payload.db.updateOne({
      collection: 'payload-jobs',
      id: waiting.holder!,
      data: { waitpoint: { jobId: randomUUID(), results: {} } },
    });

    await expect(resumeWaitpoint({ req, token: waiting.token, data: 'old' })).rejects.toMatchObject(
      {
        status: 409,
        code: 'WAITPOINT_CONSUMED',
      },
    );

    expect((await findWaitpoint({ req, token: waiting.token }))?.status).toBe('pending');
    expect((await holder(waiting)).waitUntil).toBe(until);

    await fixture.payload.db.updateOne({
      collection: 'frogbot-waitpoints',
      id: waiting.id,
      data: { status: 'resumed', data: 'accepted before replacement' },
    });

    await expect(
      dispatchWaitpoint({ req, waitpoint: { ...waiting, status: 'resumed' } }),
    ).resolves.toEqual({});

    expect((await findWaitpoint({ req, token: waiting.token }))?.dispatched).toBe(true);
    expect((await holder(waiting)).waitUntil).toBe(until);
    await expectNoContinuationJobs();
  });

  it('a duplicate during a delay wait resolves with the paused workflow', async () => {
    const started = vi.fn();

    handler = async ({ waitFor }) => {
      started();

      await waitFor('delay', { until: new Date(Date.now() + 60_000) });
    };

    const source = await fixture.frogbot.jobs.queue({
      workflow: 'wait',
      input: { key: 'delay-original' },
      jobId: 'delay-duplicate',
    });

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    const duplicate = await fixture.frogbot.jobs.queue({
      workflow: 'wait',
      input: { key: 'delay-duplicate' },
      jobId: 'delay-duplicate',
    });

    expect(duplicate.id).toBe(source.id);
    expect(duplicate.input).toEqual(source.input);
    expect(started).toHaveBeenCalledTimes(1);
  });

  it('a paused workflow keeps its row live and is not deleted', async () => {
    const until = new Date(Date.now() + 60_000).toISOString();
    const prepare = vi.fn(() => ({ output: { prepared: true } }));

    handler = async ({ inlineTask, waitFor }) => {
      await inlineTask('prepare', { task: prepare });

      await waitFor('delay', { until });
    };

    const source = await fixture.frogbot.jobs.queue({
      workflow: 'wait',
      input: { key: 'live-delay' },
      jobId: 'live-delay',
    });

    const completed = await fixture.frogbot.jobs.queue({
      workflow: 'complete',
      input: {},
    });

    await fixture.frogbot.jobs.run({ queue: 'approvals', silent: true });

    const stored = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      where: {},
      limit: 0,
    });
    const waiting = await fixture.payload.db.find({
      collection: 'frogbot-waitpoints',
      where: {},
      limit: 0,
    });

    expect(stored.docs).toHaveLength(1);
    expect(stored.docs[0]).toMatchObject({
      id: source.id,
      jobId: 'live-delay',
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
    expect(stored.docs.map(({ id }) => id)).not.toContain(completed.id);
    expect(waiting.docs).toHaveLength(1);
    expect(waiting.docs[0]).toMatchObject({ holder: source.id, kind: 'delay', dispatched: true });
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('jobs.run does not claim a paused row before its waitUntil', async () => {
    const started = vi.fn();
    const until = new Date(Date.now() + 60_000).toISOString();

    handler = async ({ waitFor }) => {
      started();

      await waitFor('delay', { until });
    };

    const source = await fixture.frogbot.jobs.queue({
      workflow: 'wait',
      input: { key: 'excluded' },
    });

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    const before = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      where: {},
      limit: 0,
    });

    await fixture.worker.jobs.run({ allQueues: true, where: {}, silent: true });

    const after = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      where: {},
      limit: 0,
    });

    expect(before.docs).toHaveLength(1);
    expect(after.docs).toEqual(before.docs);
    expect(started).toHaveBeenCalledTimes(1);
  });

  it('runByID reruns a paused delay and it pauses again', async () => {
    const started = vi.fn();
    const finished = vi.fn();
    const until = new Date(Date.now() + 60_000).toISOString();

    handler = async ({ waitFor }) => {
      started();

      await waitFor('delay', { until });

      finished();
    };

    const source = await fixture.frogbot.jobs.queue({
      workflow: 'wait',
      input: { key: 'forced-delay' },
      jobId: 'forced-delay',
    });

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    const before = await fixture.payload.db.find({
      collection: 'frogbot-waitpoints',
      where: {},
      limit: 0,
    });

    await fixture.worker.jobs.runByID({ id: source.id, silent: true });

    const stored = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      where: {},
      limit: 0,
    });
    const after = await fixture.payload.db.find({
      collection: 'frogbot-waitpoints',
      where: {},
      limit: 0,
    });

    expect(started).toHaveBeenCalledTimes(2);
    expect(finished).not.toHaveBeenCalled();
    expect(stored.docs).toHaveLength(1);
    expect(stored.docs[0]).toMatchObject({
      id: source.id,
      jobId: 'forced-delay',
      waitUntil: until,
      processing: false,
      totalTried: 0,
    });
    expect(stored.docs[0].completedAt).toBeFalsy();
    expect(after.docs).toEqual(before.docs);
  });

  it('the waitpoint sweep does not wake a delay early', async () => {
    const until = new Date(Date.now() + 60_000).toISOString();

    handler = async ({ waitFor }) => {
      await waitFor('delay', { until });
    };

    const source = await fixture.frogbot.jobs.queue({
      workflow: 'wait',
      input: { key: 'sweep-delay' },
    });

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    const before = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      where: {},
      limit: 0,
    });

    await sweepWaitpoints({ req: workerReq });

    const after = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      where: {},
      limit: 0,
    });
    const waiting = await fixture.payload.db.find({
      collection: 'frogbot-waitpoints',
      where: {},
      limit: 0,
    });

    expect(before.docs).toHaveLength(1);
    expect(after.docs).toEqual(before.docs);
    expect(after.docs[0].waitUntil).toBe(until);
    expect(waiting.docs[0]).toMatchObject({ holder: source.id, dispatched: true });
  });

  it('a paused scheduled workflow skips the next schedule tick', async () => {
    const now = Date.now();
    const until = new Date(now + 600_000).toISOString();

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);

    handler = async ({ waitFor }) => {
      await waitFor('delay', { until });
    };

    const firstTick = await fixture.frogbot.jobs.handleSchedules({ queue: 'scheduled-approvals' });
    const scheduled = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      where: {},
      limit: 0,
    });

    expect(firstTick.errored).toEqual([]);
    expect(firstTick.queued).toHaveLength(1);
    expect(scheduled.docs).toHaveLength(1);

    vi.setSystemTime(timestamp(scheduled.docs[0].waitUntil) + 1);

    await fixture.frogbot.jobs.run({ queue: 'scheduled-approvals', silent: true });

    vi.setSystemTime(Date.now() + 60_000);

    const nextTick = await fixture.worker.jobs.handleSchedules({ queue: 'scheduled-approvals' });
    const stored = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      where: {},
      limit: 0,
    });

    expect(nextTick.errored).toEqual([]);
    expect(nextTick.queued).toEqual([]);
    expect(nextTick.skipped).toHaveLength(1);
    expect(stored.docs).toHaveLength(1);
    expect(stored.docs[0]).toMatchObject({
      id: scheduled.docs[0].id,
      waitUntil: until,
      meta: { scheduled: true },
    });
    expect(stored.docs[0].completedAt).toBeFalsy();
    expect(stored.docs[0].error).toBeFalsy();
  });

  it('parallel resumes wake the holder once and replay its inline checkpoints', async () => {
    const prepare = vi.fn(() => ({ output: { prepared: true } }));
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

    const paused = (
      await fixture.payload.db.find<FrogBotJob>({ collection: 'payload-jobs', limit: 0 })
    ).docs;

    expect(paused).toHaveLength(1);
    expect(paused[0]).toMatchObject({ id: source.id, processing: false, completedAt: null });

    const attempts = await Promise.allSettled(
      Array.from({ length: 12 }, (_, index) =>
        (index % 2 ? fixture.frogbot : fixture.worker).jobs.resume({ token, data: { index } }),
      ),
    );

    expect(attempts.filter(({ status }) => status === 'fulfilled')).toEqual([
      { status: 'fulfilled', value: { jobId: source.id } },
    ]);
    expect(attempts.filter(({ status }) => status === 'rejected')).toEqual(
      Array.from({ length: 11 }, () => ({
        status: 'rejected',
        reason: expect.objectContaining({ status: 409, code: 'WAITPOINT_CONSUMED' }),
      })),
    );

    const stored = (await findWaitpoint({ req, token }))!;
    const woken = await holder(stored);

    expect(stored.dispatched).toBe(true);
    expect(woken).toMatchObject({
      id: source.id,
      queue: 'approvals',
      concurrencyKey: 'approval',
      input: { key: 'approval' },
      meta: { origin: 'email' },
      waitpoint: {
        jobId: stored.jobId,
        results: {},
      },
    });
    expect(timestamp(woken.waitUntil)).toBeLessThanOrEqual(Date.now());
    expect((woken.log ?? []).map(({ taskID }) => taskID)).toEqual(['prepare']);

    await fixture.worker.jobs.runByID({ id: source.id, silent: true });

    expect(prepare).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      {
        result: { expired: false, data: stored.data },
        input: { key: 'approval' },
        meta: { origin: 'email' },
      },
    ]);
    expect(await holder(stored)).toBeUndefined();

    await Promise.all([
      dispatchWaitpoint({ req, waitpoint: { ...stored, dispatched: false } }),
      sweepWaitpoints({ req: workerReq }),
    ]);

    await expectNoContinuationJobs();
    expect((await findWaitpoint({ req, token }))?.dispatched).toBe(true);
  });

  it('buffers an early response, preserves it at readiness, and recovers failed dispatch', async () => {
    const waiting = await point({ ready: false });
    const response = { approved: true };

    await expect(
      fixture.worker.jobs.resume({ token: waiting.token, data: response }),
    ).resolves.toEqual({ jobId: waiting.holder });

    response.approved = false;

    const before = await holder(waiting);

    await markWaitpointReady({ req, waitpoint: waiting });

    const ready = (await findWaitpoint({ req, token: waiting.token }))!;

    expect(ready).toMatchObject({
      ready: true,
      status: 'resumed',
      data: { approved: true },
    });
    expect(await holder(waiting)).toEqual(before);

    const failure = new Error('wake is unavailable');
    const wake = failNextWake(fixture.payload, failure);

    await expect(dispatchWaitpoint({ req, waitpoint: ready })).rejects.toBe(failure);

    expect((await findWaitpoint({ req, token: waiting.token }))?.dispatched).toBe(false);
    expect(await holder(waiting)).toEqual(before);

    wake.mockRestore();

    await sweepWaitpoints({ req: workerReq });

    expect((await holder(waiting)).id).toBe(waiting.holder);
    expect(timestamp((await holder(waiting)).waitUntil)).toBeLessThanOrEqual(Date.now());
    expect((await findWaitpoint({ req, token: waiting.token }))?.dispatched).toBe(true);
    await expectNoContinuationJobs();
  });

  it('preserves inline callback checkpoints when an early response arrives', async () => {
    const prepare = vi.fn(() => ({ output: { prepared: true } }));
    const notify = vi.fn(() => ({ output: { sent: true } }));
    const finished = vi.fn();
    let token = '';

    handler = async ({ inlineTask, waitFor }) => {
      await inlineTask('prepare', { task: prepare });

      const result = await waitFor('approval', {
        onWait: async ({ resumeUrl }) => {
          token = new URL(resumeUrl).pathname.split('/')[3];

          await expect(fixture.worker.jobs.resume({ token, data: 'approved' })).resolves.toEqual({
            jobId: source.id,
          });

          await inlineTask('notify', { task: notify });
        },
      });

      finished(result);
    };

    const source = await fixture.frogbot.jobs.queue({ workflow: 'wait', input: { key: 'early' } });

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    const waiting = (await findWaitpoint({ req, token }))!;
    const sourceAfter = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      where: { id: { equals: source.id } },
      limit: 1,
    });

    expect(sourceAfter.docs[0]?.error).toBeNull();
    expect(waiting).toMatchObject({ holder: source.id, status: 'resumed', ready: true });
    expect((sourceAfter.docs[0].log ?? []).map(({ taskID }) => taskID)).toEqual([
      'prepare',
      'notify',
    ]);
    expect(timestamp(sourceAfter.docs[0].waitUntil)).toBeLessThanOrEqual(Date.now());

    await sweepWaitpoints({ req: workerReq });

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect(prepare).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(finished).toHaveBeenCalledExactlyOnceWith({ expired: false, data: 'approved' });
    await expectNoContinuationJobs();
  });

  it('keeps paused workflows on distinct rows with independent run identities', async () => {
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

    expect(second.id).not.toBe(first.id);

    expect(notifications).toHaveLength(2);
    expect(notifications[0]).not.toBe(notifications[1]);

    const firstWait = await findWaitpoint({ req, token: notifications[0] });
    const secondWait = await findWaitpoint({ req, token: notifications[1] });

    expect(firstWait?.jobId).not.toBe(secondWait?.jobId);
    expect((await holder(firstWait!)).input).toEqual({ key: 'first' });
    expect((await holder(secondWait!)).input).toEqual({ key: 'second' });
  });

  it('serializes overlapping creator and sweep wakes', async () => {
    const waiting = await point({ status: 'resumed', data: 'accepted' });
    const entered = deferred();
    const release = deferred();
    const before = await holder(waiting);
    const writes = vi.fn(async () => {
      entered.resolve();

      await release.promise;
    });

    releases.push(release.resolve);
    mockWake(fixture.payload, writes);

    const first = dispatchWaitpoint({ req, waitpoint: waiting });

    inFlight.push(first);

    await entered.promise;

    await Promise.all([
      sweepWaitpoints({ req: workerReq }),
      ...Array.from({ length: 8 }, () => dispatchWaitpoint({ req: workerReq, waitpoint: waiting })),
    ]);

    expect(await holder(waiting)).toEqual(before);

    release.resolve();

    await expect(first).resolves.toEqual({ jobId: waiting.holder });

    expect(writes).toHaveBeenCalledTimes(1);
    expect((await holder(waiting)).id).toBe(waiting.holder);
    expect((await findWaitpoint({ req, token: waiting.token }))?.dispatched).toBe(true);
    await expectNoContinuationJobs();
  });

  it('recovers an abandoned dispatch claim on the same holder', async () => {
    const waiting = await point({ status: 'resumed', data: 'accepted' });

    await dispatchWaitpoint({ req, waitpoint: waiting });

    const before = await holder(waiting);

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

    const after = await holder(waiting);

    expect(after.id).toBe(before.id);
    expect(timestamp(after.waitUntil)).toBeLessThanOrEqual(Date.now());
    expect((await findWaitpoint({ req, token: waiting.token }))?.dispatched).toBe(true);
    await expectNoContinuationJobs();
  });

  it('renews the dispatch lease while a holder wake is blocked', async () => {
    const now = Date.now();
    const waiting = await point({ status: 'resumed', data: 'accepted' });
    const entered = deferred();
    const release = deferred();
    const writes = vi.fn(async () => {
      entered.resolve();

      await release.promise;
    });

    releases.push(release.resolve);

    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(now);

    mockWake(fixture.payload, writes);

    const dispatch = dispatchWaitpoint({ req, waitpoint: waiting });

    inFlight.push(dispatch);

    await entered.promise;

    const claimed = (await findWaitpoint({ req, token: waiting.token }))!;

    await vi.advanceTimersByTimeAsync(12_000);
    await vi.waitFor(async () => {
      const renewed = (await findWaitpoint({ req, token: waiting.token }))!;

      expect(Date.parse(renewed.dispatchLeaseUntil!)).toBe(now + 72_000);
    });

    const renewed = (await findWaitpoint({ req, token: waiting.token }))!;

    expect(renewed.dispatchOwner).toBe(claimed.dispatchOwner);

    await sweepWaitpoints({ req: workerReq });

    expect(writes).toHaveBeenCalledTimes(1);

    release.resolve();

    await expect(dispatch).resolves.toEqual({ jobId: waiting.holder });

    expect((await findWaitpoint({ req, token: waiting.token }))?.dispatched).toBe(true);
    await expectNoContinuationJobs();
  });

  it('a wake losing to a processing claim releases dispatch for the sweep', async () => {
    const waiting = await point({ status: 'resumed', data: 'accepted' });
    const before = await holder(waiting);
    const wake = mockWake(fixture.payload, async () => {
      await fixture.workerPayload.db.updateOne({
        collection: 'payload-jobs',
        id: waiting.holder!,
        data: { processing: true },
      });
    });

    await expect(dispatchWaitpoint({ req, waitpoint: waiting })).resolves.toEqual({});

    const lost = (await findWaitpoint({ req, token: waiting.token }))!;

    expect(lost).toMatchObject({
      dispatched: false,
      dispatchOwner: null,
      dispatchLeaseUntil: null,
    });
    expect((await holder(waiting)).waitUntil).toBe(before.waitUntil);

    wake.mockRestore();

    await fixture.workerPayload.db.updateOne({
      collection: 'payload-jobs',
      id: waiting.holder!,
      data: { processing: false },
    });
    await sweepWaitpoints({ req: workerReq });

    expect((await findWaitpoint({ req, token: waiting.token }))?.dispatched).toBe(true);
    expect(timestamp((await holder(waiting)).waitUntil)).toBeLessThanOrEqual(Date.now());
    await expectNoContinuationJobs();
  });

  it('a lost dispatch claim never marks another owner as dispatched', async () => {
    const waiting = await point({ status: 'resumed', data: 'accepted' });
    const wake = mockWake(fixture.payload, async () => {
      await fixture.workerPayload.db.updateOne({
        collection: 'frogbot-waitpoints',
        id: waiting.id,
        data: {
          dispatchOwner: 'replacement-owner',
          dispatchLeaseUntil: new Date(Date.now() + 60_000).toISOString(),
        },
      });
    });

    await expect(dispatchWaitpoint({ req, waitpoint: waiting })).rejects.toThrow(
      'FrogBot waitpoint dispatch claim was lost.',
    );

    expect(await findWaitpoint({ req, token: waiting.token })).toMatchObject({
      dispatched: false,
      dispatchOwner: 'replacement-owner',
    });

    wake.mockRestore();

    await fixture.workerPayload.db.updateOne({
      collection: 'frogbot-waitpoints',
      id: waiting.id,
      data: { dispatchLeaseUntil: new Date(Date.now() - 1).toISOString() },
    });
    await sweepWaitpoints({ req: workerReq });

    expect((await holder(waiting)).id).toBe(waiting.holder);
    expect((await findWaitpoint({ req, token: waiting.token }))?.dispatched).toBe(true);
    await expectNoContinuationJobs();
  });

  it('a supersedes replacement deletes a paused workflow and its token is refused', async () => {
    let token = '';

    handler = async ({ waitFor }) => {
      await waitFor('approval', {
        onWait: ({ resumeUrl }) => {
          token = new URL(resumeUrl).pathname.split('/')[3];
        },
      });
    };

    const source = await fixture.frogbot.jobs.queue({
      workflow: 'wait',
      input: { key: 'superseded', value: 'original' },
      jobId: 'superseded',
    });

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    const replacement = await fixture.worker.jobs.queue({
      workflow: 'wait',
      input: { key: 'superseded', value: 'replacement' },
      jobId: 'superseded',
    });
    const before = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      limit: 0,
    });

    await expect(fixture.frogbot.jobs.resume({ token, data: 'old' })).rejects.toMatchObject({
      status: 409,
      code: 'WAITPOINT_CONSUMED',
    });

    const waiting = (await findWaitpoint({ req, token }))!;

    expect(before.docs).toHaveLength(1);
    expect(before.docs[0]).toMatchObject({
      id: replacement.id,
      jobId: 'superseded',
      input: { key: 'superseded', value: 'replacement' },
    });
    expect(waiting.status).toBe('pending');
    expect(waiting.data).toBeFalsy();

    await expect(
      dispatchWaitpoint({ req, waitpoint: { ...waiting, status: 'expired' } }),
    ).resolves.toEqual({});

    expect(
      (await fixture.payload.db.find<FrogBotJob>({ collection: 'payload-jobs', limit: 0 })).docs,
    ).toEqual(before.docs);
    await expectNoContinuationJobs();
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

    const expired = await holder(due);

    expect(expired.id).toBe(due.holder);
    expect(expired.waitUntil).toBe(new Date(now - 1).toISOString());
    expect((await findWaitpoint({ req, token: due.token }))?.status).toBe('expired');
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

  it('a delay resumes the same row at until', async () => {
    const now = Date.now();
    const until = new Date(now + 60_000).toISOString();
    const completed = vi.fn();
    const prepare = vi.fn(() => ({ output: { prepared: true } }));

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);

    handler = async ({ inlineTask, waitFor }) => {
      await inlineTask('prepare', { task: prepare });

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

    const source = await fixture.frogbot.jobs.queue({
      workflow: 'wait',
      input: { key: 'delay' },
      jobId: 'delay-until',
    });

    await fixture.payload.db.updateOne({
      collection: 'payload-jobs',
      id: source.id,
      data: {
        waitpoint: {
          jobId: randomUUID(),
          results: { approval: { expired: false, data: 'yes' } },
        },
      },
    });

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    const paused = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      where: {},
      limit: 0,
    });

    expect(paused.docs).toHaveLength(1);
    expect(paused.docs[0]).toMatchObject({ id: source.id, jobId: 'delay-until', waitUntil: until });

    vi.setSystemTime(now + 59_999);

    await fixture.worker.jobs.run({ queue: 'approvals', silent: true });

    expect(completed).not.toHaveBeenCalled();

    vi.setSystemTime(until);

    await fixture.worker.jobs.runByID({ id: source.id, silent: true });

    expect(completed).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(
      (
        await fixture.payload.db.find<FrogBotJob>({
          collection: 'payload-jobs',
          where: {},
          limit: 0,
        })
      ).docs,
    ).toHaveLength(0);
  });

  it('does not mask wake write failures as dispatch success', async () => {
    const waiting = await point({ status: 'resumed', data: null });
    const failure = new Error('not a unique constraint error');

    failNextWake(fixture.payload, failure);

    await expect(dispatchWaitpoint({ req, waitpoint: waiting })).rejects.toBe(failure);

    expect((await findWaitpoint({ req, token: waiting.token }))?.dispatched).toBe(false);
  });

  it('uses FrogBot requests and returns stable missing-token errors', async () => {
    const waiting = await point({ ready: false });
    const localReq = await fixture.frogbot.createRequest({ context: { origin: 'trigger' } });

    await expect(
      fixture.frogbot.jobs.resume({ token: waiting.token, data: null, req: localReq }),
    ).resolves.toEqual({ jobId: waiting.holder });
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
    const jobs = await fixture.payload.db.find<FrogBotJob>({
      collection: 'payload-jobs',
      where: {},
      limit: 0,
    });

    expect(undispatched.docs).toHaveLength(0);
    expect(jobs.docs).toHaveLength(waits.length);
    expect(new Set(jobs.docs.map(({ id }) => id))).toEqual(
      new Set(waits.map(({ holder }) => holder)),
    );
    expect(jobs.docs.every(({ waitUntil }) => timestamp(waitUntil) <= Date.now())).toBe(true);
    await expectNoContinuationJobs();
  });

  it('continues recovery after one dispatch fails and retries that wait on the next sweep', async () => {
    const first = await point({ status: 'resumed', data: { accepted: true } });
    const second = await point({ status: 'resumed', data: { accepted: true } });
    const failure = new Error('temporary wake failure');
    const wake = failNextWake(fixture.payload, failure);

    await expect(sweepWaitpoints({ req })).rejects.toMatchObject({ errors: [failure] });

    expect((await findWaitpoint({ req, token: first.token }))?.dispatched).toBe(false);
    expect((await findWaitpoint({ req, token: second.token }))?.dispatched).toBe(true);

    wake.mockRestore();

    await sweepWaitpoints({ req: workerReq });

    expect((await holder(first)).id).toBe(first.holder);
    expect((await holder(second)).id).toBe(second.holder);
    expect((await findWaitpoint({ req, token: first.token }))?.dispatched).toBe(true);
    expect((await findWaitpoint({ req, token: second.token }))?.dispatched).toBe(true);
    await expectNoContinuationJobs();
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

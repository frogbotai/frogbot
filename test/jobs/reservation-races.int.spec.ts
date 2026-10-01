import { randomUUID } from 'node:crypto';

import { sweepJobLeases } from 'frogbot/jobs';
import { createLocalReq, type Payload } from 'payload';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowHandler } from '../../packages/frogbot/dist/jobs/types.js';
import {
  dispatchWaitpoint,
  sweepWaitpoints,
} from '../../packages/frogbot/dist/jobs/waitpoints/operations.js';
import type { Waitpoint } from '../../packages/frogbot/dist/jobs/waitpoints/types.js';
import { adapterName, bootJobsFixture, deferred } from './fixture.js';

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;
let handler: WorkflowHandler;

const releases: (() => void)[] = [];
const inFlight: Promise<unknown>[] = [];

beforeAll(async () => {
  fixture = await bootJobsFixture({
    jobs: {
      workflows: [
        { slug: 'reservation-race', retries: 0, handler: (args) => handler(args) },
        {
          slug: 'retrying-reservation-race',
          retries: { attempts: 2, backoff: { type: 'fixed', delay: 60_000 } },
          handler: (args) => handler(args),
        },
      ],
    },
  });
});

beforeEach(async () => {
  await fixture.payload.db.deleteMany({ collection: 'payload-jobs', where: {} });
  await fixture.payload.db.deleteMany({ collection: 'frogbot-waitpoints', where: {} });
  await fixture.payload.db.deleteMany({ collection: 'effects', where: {} });
});

afterEach(async () => {
  for (const release of releases.splice(0)) release();

  await Promise.allSettled(inFlight.splice(0));

  vi.restoreAllMocks();
  vi.useRealTimers();
});

afterAll(async () => {
  await fixture?.shutdown();
});

async function readJob(id: number | string) {
  const result = await fixture.payload.db.find({
    collection: 'payload-jobs',
    where: { id: { equals: id } },
    limit: 1,
    pagination: false,
  });

  return result.docs[0];
}

async function readWaitpoints() {
  const result = await fixture.payload.db.find({ collection: 'frogbot-waitpoints', limit: 0 });

  return result.docs as Waitpoint[];
}

function gateHolderRead(
  payload: Payload,
  entered: ReturnType<typeof deferred>,
  release: ReturnType<typeof deferred>,
) {
  const find = payload.db.find.bind(payload.db);

  return vi.spyOn(payload.db, 'find').mockImplementation(async (args) => {
    const result = await find(args);

    if (args.collection === 'payload-jobs') {
      entered.resolve();

      await release.promise;
    }

    return result;
  });
}

function crashCompletion(
  payload: Payload,
  id: number | string,
  entered: ReturnType<typeof deferred>,
  release: ReturnType<typeof deferred>,
) {
  const updateJobs = payload.db.updateJobs.bind(payload.db);

  return vi.spyOn(payload.db, 'updateJobs').mockImplementation(async (args) => {
    if (args.id === id && args.data.completedAt) {
      entered.resolve();

      await release.promise;

      throw new Error('FrogBot crashed worker loses its completion write');
    }

    return updateJobs(args);
  });
}

describe(`reservation races: ${adapterName}`, () => {
  it('lease recovery replays a closed expiry after a crash before completion', async () => {
    const entered = deferred();
    const release = deferred();
    const notify = vi.fn();
    const results: unknown[] = [];
    const now = Date.now();
    const jobId = randomUUID();

    releases.push(release.resolve);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);

    handler = async ({ waitFor }) => {
      const result = await waitFor('approval', { expiresIn: 60_000, onWait: notify });

      results.push(result);
    };

    const source = await fixture.frogbot.jobs.queue({ workflow: 'reservation-race', jobId });

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    const waiting = (await readWaitpoints())[0];
    const blocked = crashCompletion(fixture.payload, source.id, entered, release);

    vi.setSystemTime(now + 60_001);

    const run = fixture.frogbot.jobs.run({ silent: true });
    const settled = Promise.allSettled([run]);

    inFlight.push(settled);

    await Promise.race([
      entered.promise,
      run.then(() => {
        throw new Error('FrogBot run finishes before reaching the completion gate');
      }),
    ]);

    const closed = (await readWaitpoints())[0];
    const processing = await readJob(source.id);
    const req = await createLocalReq({}, fixture.workerPayload);

    expect(closed).toMatchObject({ id: waiting.id, status: 'expired', dispatched: true });
    expect(processing).toMatchObject({ processing: true, completedAt: null, hasError: false });

    vi.setSystemTime(Date.parse(processing.leaseUntil) + 1);

    await sweepJobLeases({ req });

    expect((await readJob(source.id)).processing).toBe(false);
    expect(
      (
        await fixture.worker.jobs.queue({
          task: 'record-effect',
          input: { marker: 'ignored' },
          jobId,
        })
      ).id,
    ).toBe(source.id);

    await sweepWaitpoints({ req });

    await fixture.worker.jobs.run({ silent: true });

    const recovered = await readJob(source.id);

    expect(recovered).toMatchObject({
      id: source.id,
      completedAt: expect.any(String),
      processing: false,
      hasError: false,
    });
    expect(await readWaitpoints()).toEqual([closed]);
    expect(results).toEqual([{ expired: true }, { expired: true }]);
    expect(notify).toHaveBeenCalledTimes(1);

    release.resolve();

    await settled;

    blocked.mockRestore();

    expect(await readJob(source.id)).toEqual(recovered);
  });

  it('cancellation during onWait remains terminal after the callback finishes', async () => {
    const entered = deferred();
    const release = deferred();
    const jobId = randomUUID();
    let token = '';

    releases.push(release.resolve);

    handler = async ({ waitFor }) => {
      await waitFor('approval', {
        onWait: async ({ resumeUrl }) => {
          token = new URL(resumeUrl).pathname.split('/')[3];
          entered.resolve();

          await release.promise;
        },
      });
    };

    const source = await fixture.frogbot.jobs.queue({ workflow: 'reservation-race', jobId });
    const run = fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    inFlight.push(run);

    await entered.promise;

    await fixture.worker.jobs.cancelByID({ id: source.id });

    expect(await readJob(source.id)).toMatchObject({ hasError: true, error: { cancelled: true } });

    release.resolve();

    await run;

    expect(await readJob(source.id)).toMatchObject({ hasError: true, error: { cancelled: true } });
    await expect(fixture.worker.jobs.resume({ token, data: 'obsolete' })).rejects.toMatchObject({
      status: 409,
    });

    const replacement = await fixture.worker.jobs.queue({ workflow: 'reservation-race', jobId });

    expect(replacement.id).not.toBe(source.id);
  });

  it('cancellation during a pause preserves completed task logs', async () => {
    const entered = deferred();
    const release = deferred();
    const marker = randomUUID();

    releases.push(release.resolve);

    handler = async ({ tasks, waitFor }) => {
      await tasks['record-effect']('checkpoint', { input: { marker } });

      await waitFor('approval', {
        onWait: async () => {
          entered.resolve();

          await release.promise;
        },
      });
    };

    const source = await fixture.frogbot.jobs.queue({ workflow: 'reservation-race' });
    const run = fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    inFlight.push(run);

    await entered.promise;

    const before = await readJob(source.id);

    expect(before.log).toEqual([
      expect.objectContaining({
        taskID: 'checkpoint',
        taskSlug: 'record-effect',
        state: 'succeeded',
      }),
    ]);

    await fixture.worker.jobs.cancelByID({ id: source.id });

    release.resolve();

    await run;

    const cancelled = await readJob(source.id);

    expect(cancelled).toMatchObject({
      completedAt: null,
      hasError: true,
      error: { cancelled: true },
    });
    expect(cancelled.log).toEqual(before.log);
  });

  it('sweeping a consumed expiry leaves the next wait deadline unchanged', async () => {
    const now = Date.now();
    const until = new Date(now + 120_000).toISOString();
    const attempts = vi.fn();

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);

    handler = async ({ waitFor }) => {
      attempts();

      await waitFor('approval', { expiresIn: 60_000, onWait: () => {} });
      await waitFor('cooldown', { until: new Date(until) });
    };

    const source = await fixture.frogbot.jobs.queue({ workflow: 'reservation-race' });

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    vi.setSystemTime(now + 60_001);

    await fixture.worker.jobs.run({ silent: true });

    expect(await readJob(source.id)).toMatchObject({ waitUntil: until, processing: false });
    expect(await readWaitpoints()).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'approval', status: 'expired' })]),
    );

    const req = await createLocalReq({}, fixture.workerPayload);

    await sweepWaitpoints({ req });

    expect(await readJob(source.id)).toMatchObject({ waitUntil: until });

    vi.setSystemTime(now + 60_002);

    await fixture.worker.jobs.run({ silent: true });

    expect(attempts).toHaveBeenCalledTimes(2);
  });

  it('consuming a wait during a blocked wake preserves the next wait deadline', async () => {
    const entered = deferred();
    const release = deferred();
    const now = Date.now();
    const until = new Date(now + 120_000).toISOString();

    releases.push(release.resolve);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);

    handler = async ({ waitFor }) => {
      await waitFor('approval', { expiresIn: 60_000, onWait: () => {} });

      await waitFor('cooldown', { until: new Date(until) });
    };

    const source = await fixture.frogbot.jobs.queue({ workflow: 'reservation-race' });

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    const waiting = (await readWaitpoints())[0];
    const req = await createLocalReq({}, fixture.workerPayload);
    const blocked = gateHolderRead(fixture.workerPayload, entered, release);

    vi.setSystemTime(now + 60_001);

    const wake = dispatchWaitpoint({ req, waitpoint: waiting });

    inFlight.push(wake);

    await entered.promise;

    await fixture.frogbot.jobs.run({ silent: true });

    const before = await readJob(source.id);

    expect(before).toMatchObject({
      waitUntil: until,
      processing: false,
      waitpoint: { results: { approval: { expired: true } } },
    });

    release.resolve();

    await wake;

    blocked.mockRestore();

    expect(await readJob(source.id)).toEqual(before);
  });

  it('sweeping a consumed expiry preserves the resumed workflow retry backoff', async () => {
    const now = Date.now();

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);

    handler = async ({ waitFor }) => {
      await waitFor('approval', { expiresIn: 60_000, onWait: () => {} });

      throw new Error('FrogBot resumed workflow retries after expiry');
    };

    const source = await fixture.frogbot.jobs.queue({ workflow: 'retrying-reservation-race' });

    await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

    vi.setSystemTime(now + 60_001);

    await fixture.frogbot.jobs.run({ silent: true });

    const before = await readJob(source.id);
    const req = await createLocalReq({}, fixture.workerPayload);

    expect(before).toMatchObject({
      completedAt: null,
      hasError: false,
      processing: false,
      totalTried: 1,
    });
    expect(before.error).toBeTruthy();
    expect(Date.parse(before.waitUntil)).toBeGreaterThan(Date.now());

    await sweepWaitpoints({ req });

    expect((await readJob(source.id)).waitUntil).toBe(before.waitUntil);
  });

  it.runIf(adapterName === 'sqlite')(
    'deletion and id reuse during a wake never changes the replacement deadline',
    async () => {
      const entered = deferred();
      const release = deferred();

      releases.push(release.resolve);

      handler = async ({ waitFor }) => {
        await waitFor('approval', { onWait: () => {} });
      };

      const source = await fixture.frogbot.jobs.queue({ workflow: 'reservation-race' });

      await fixture.frogbot.jobs.runByID({ id: source.id, silent: true });

      const waiting = (await readWaitpoints())[0];

      await fixture.payload.db.updateOne({
        collection: 'frogbot-waitpoints',
        id: waiting.id,
        data: { status: 'resumed', data: 'accepted' },
      });

      const req = await createLocalReq({}, fixture.workerPayload);
      const blocked = gateHolderRead(fixture.workerPayload, entered, release);
      const wake = dispatchWaitpoint({ req, waitpoint: { ...waiting, status: 'resumed' } });

      inFlight.push(wake);

      await entered.promise;

      await fixture.frogbot.delete({ collection: 'payload-jobs', id: source.id });

      const until = new Date(Date.now() + 120_000).toISOString();
      const replacement = await fixture.frogbot.jobs.queue({
        task: 'record-effect',
        input: { marker: 'unrelated' },
        waitUntil: new Date(until),
      });
      const before = await readJob(replacement.id);

      expect(replacement.id).toBe(source.id);

      release.resolve();

      await wake;

      blocked.mockRestore();

      expect(await readJob(replacement.id)).toEqual(before);
    },
  );

  it('a nullable hasError edit cannot create two live holders of one jobId', async () => {
    const jobId = randomUUID();
    const first = await fixture.frogbot.jobs.queue({ task: 'record-effect', input: {}, jobId });

    await fixture.frogbot.jobs.cancelByID({ id: first.id });

    const second = await fixture.worker.jobs.queue({ task: 'record-effect', input: {}, jobId });

    await Promise.allSettled([
      fixture.frogbot.update({
        collection: 'payload-jobs',
        id: first.id,
        data: { hasError: null, error: null },
      }),
    ]);

    const rows = await fixture.payload.db.find({ collection: 'payload-jobs', limit: 0 });

    expect(rows.docs.filter((row) => !row.completedAt && row.hasError !== true)).toHaveLength(1);
    expect(await readJob(second.id)).toMatchObject({ hasError: false });
  });
});

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID } from 'node:crypto';

import { type Config, createLocalReq, type Job, type Payload, type PayloadRequest } from 'payload';

import { withJobLease } from './lease.js';
import type { Jobs, JobsRuntime } from './types.js';
import { resumeWaitpoint } from './waitpoints/operations.js';
import type { Waitpoint, WaitpointReplay } from './waitpoints/types.js';

type JobQueueSeed = {
  jobId?: string;
  log?: Job['log'];
  meta?: Job['meta'];
  waitpoint?: WaitpointReplay;
};

type JobEnqueue = (
  args: Parameters<Payload['jobs']['queue']>[0],
  seed?: JobQueueSeed,
) => Promise<Job>;

const queueContext = new AsyncLocalStorage<{ payload: Payload; seed: JobQueueSeed } | undefined>();
const runtimes = new WeakMap<Payload, Jobs>();
const enqueues = new WeakMap<Payload, JobEnqueue>();

export async function queueWaitpointContinuation({
  req,
  waitpoint,
}: {
  req: PayloadRequest;
  waitpoint: Waitpoint;
}): Promise<Job> {
  const enqueue = enqueues.get(req.payload);

  if (!enqueue) throw new Error('FrogBot waitpoints require the jobs runtime.');

  const { snapshot } = waitpoint;
  const result =
    waitpoint.kind === 'delay'
      ? null
      : waitpoint.status === 'expired'
        ? { expired: true as const }
        : { expired: false as const, data: waitpoint.data };

  return enqueue(
    {
      req,
      workflow: snapshot.workflow,
      input: snapshot.input,
      queue: snapshot.queue,
      meta: snapshot.meta,
      waitUntil: waitpoint.kind === 'delay' ? new Date(waitpoint.until!) : undefined,
    },
    {
      jobId: `frogbot-waitpoint:${waitpoint.token}`,
      log: (snapshot.log ?? [])
        .filter(({ state, taskSlug }) => state === 'succeeded' && taskSlug === 'inline')
        .map((entry) => ({ ...entry, id: randomBytes(12).toString('hex') })),
      meta: snapshot.meta,
      waitpoint: {
        jobId: waitpoint.jobId,
        results: { ...snapshot.results, [waitpoint.name]: result },
      },
    },
  );
}

export function installJobsRuntime({
  payload,
  leaseDuration,
}: {
  payload: Payload;
  leaseDuration: number;
}): Jobs {
  const installed = runtimes.get(payload);

  if (installed) return installed;

  const nativeQueue = payload.jobs.queue.bind(payload.jobs);
  const nativeRun = payload.jobs.run.bind(payload.jobs);
  const nativeRunByID = payload.jobs.runByID.bind(payload.jobs);
  const nativeCreate = payload.create.bind(payload);
  const nativeDBCreate = payload.db.create.bind(payload.db);

  payload.create = ((args) => {
    const context = queueContext.getStore();

    if (args.collection !== 'payload-jobs' || context?.payload !== payload) {
      return nativeCreate(args);
    }

    return queueContext.run(undefined, () =>
      nativeCreate({
        ...args,
        data: { ...args.data, ...context.seed },
      }),
    );
  }) as Payload['create'];

  payload.db.create = (args) => {
    const context = queueContext.getStore();

    if (args.collection !== 'payload-jobs' || context?.payload !== payload) {
      return nativeDBCreate(args);
    }

    return queueContext.run(undefined, () =>
      nativeDBCreate({
        ...args,
        data: { ...args.data, ...context.seed },
      }),
    );
  };

  const jobs = payload.jobs as JobsRuntime;
  const enqueue: JobEnqueue = (args, seed) => {
    const data = args.workflow
      ? { ...seed, waitpoint: seed?.waitpoint ?? { jobId: randomUUID(), results: {} } }
      : seed;

    return queueContext.run(data === undefined ? undefined : { payload, seed: data }, () =>
      nativeQueue(args),
    );
  };

  enqueues.set(payload, enqueue);

  jobs.queue = ((args) => {
    const { jobId, ...nativeArgs } = args;

    return enqueue(nativeArgs, jobId === undefined ? undefined : { jobId });
  }) as JobsRuntime['queue'];

  jobs.resume = async ({ token, data, req }) =>
    resumeWaitpoint({
      token,
      data,
      req: await createLocalReq({ req: req as unknown as PayloadRequest }, payload),
    });

  jobs.run = (args) =>
    withJobLease({
      payload,
      req: args?.req,
      leaseDuration,
      run: () => nativeRun(args),
    });

  jobs.runByID = (args) =>
    withJobLease({
      payload,
      req: args.req,
      leaseDuration,
      run: () => nativeRunByID(args),
    });

  const publicJobs = jobs as Jobs;

  runtimes.set(payload, publicJobs);

  return publicJobs;
}

export function withJobsRuntime({
  adapter,
  leaseDuration,
}: {
  adapter: Config['db'];
  leaseDuration: number;
}): Config['db'] {
  return {
    ...adapter,
    init(args) {
      const database = adapter.init(args);

      args.payload.db = database;

      installJobsRuntime({ payload: args.payload, leaseDuration });

      return database;
    },
  };
}

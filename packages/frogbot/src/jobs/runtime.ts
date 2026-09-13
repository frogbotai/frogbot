import { AsyncLocalStorage } from 'node:async_hooks';

import type { Config, Payload } from 'payload';

import { withJobLease } from './lease.js';
import type { Jobs, JobsRuntime } from './types.js';

const queueContext = new AsyncLocalStorage<{ payload: Payload; jobId: string } | undefined>();
const runtimes = new WeakMap<Payload, Jobs>();

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
        data: { ...args.data, jobId: context.jobId },
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
        data: { ...args.data, jobId: context.jobId },
      }),
    );
  };

  const jobs = payload.jobs as JobsRuntime;

  jobs.queue = ((args) => {
    const { jobId, ...nativeArgs } = args;

    return queueContext.run(jobId === undefined ? undefined : { payload, jobId }, () =>
      nativeQueue(nativeArgs),
    );
  }) as JobsRuntime['queue'];

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

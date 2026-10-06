import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import { type Config, createLocalReq, type Job, type Payload, type PayloadRequest } from 'payload';

import { compareAndSet } from '../database/compareAndSet.js';
import { type JobInsertDatabase, jobInsertOperations } from './insert.js';
import { getJobLeaseContext, withJobLease } from './lease.js';
import { type JobLogDatabase, jobLogOperations } from './log.js';
import type { Jobs, JobsRuntime } from './types.js';
import { resumeWaitpoint } from './waitpoints/operations.js';
import type { WaitpointReplay } from './waitpoints/types.js';

type JobQueueSeed = {
  jobId?: string;
  waitpoint?: WaitpointReplay;
};

type JobEnqueue = (
  args: Parameters<Payload['jobs']['queue']>[0],
  seed?: JobQueueSeed,
) => Promise<Job>;

const queueContext = new AsyncLocalStorage<{ payload: Payload; seed: JobQueueSeed } | undefined>();
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
  const nativeUpdateJobs = payload.db.updateJobs.bind(payload.db);
  const nativeDeleteMany = payload.db.deleteMany.bind(payload.db);

  payload.db.updateJobs = async (args) => {
    const context = getJobLeaseContext();
    const rearm =
      context?.payload === payload && args.id !== undefined
        ? context.rearm.get(args.id)
        : undefined;

    if (!rearm || !args.data.completedAt) return nativeUpdateJobs(args);

    const id = args.id!;
    const req = { ...args.req, payload } as PayloadRequest;
    const operations = (payload.db as JobLogDatabase)[jobLogOperations];

    if (!operations) throw new Error('FrogBot workflow waits require job log operations.');

    const rearmed = await compareAndSet({
      req,
      collection: 'payload-jobs',
      where: {
        and: [
          { id: { equals: id } },
          { completedAt: { exists: false } },
          { hasError: { not_equals: true } },
        ],
      },
      data: {
        completedAt: null,
        hasError: false,
        error: null,
        totalTried: 0,
        waitUntil: rearm.waitUntil,
        waitpoint: rearm.waitpoint,
      },
    });

    if (!rearmed) {
      context!.rearm.delete(id);

      return nativeUpdateJobs(args);
    }

    await operations.prune({ id, keep: (rearm.log ?? []).map((entry) => entry.id), req });

    await compareAndSet({
      req,
      collection: 'payload-jobs',
      where: { and: [{ id: { equals: id } }, { processing: { equals: true } }] },
      data: { processing: false, leaseOwner: null, leaseUntil: null },
    });

    if (args.returning === false) return null;

    const result = await payload.db.find({
      collection: 'payload-jobs',
      where: { id: { equals: id } },
      limit: 1,
      pagination: false,
      req: args.req,
    });

    return result.docs as Job[];
  };

  payload.db.deleteMany = async (args) => {
    const context = getJobLeaseContext();
    const idFilter = args.where?.id;
    const ids = idFilter && !Array.isArray(idFilter) ? idFilter.in : undefined;

    if (
      args.collection !== 'payload-jobs' ||
      context?.payload !== payload ||
      !context.rearm.size ||
      !Array.isArray(ids)
    ) {
      return nativeDeleteMany(args);
    }

    const completed = ids.filter((id) => !context.rearm.has(id));

    if (!completed.length) return;

    return nativeDeleteMany({
      ...args,
      where: { ...args.where, id: { ...idFilter, in: completed } },
    });
  };

  payload.create = (args) => {
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
  };

  payload.db.create = (args) => {
    const context = queueContext.getStore();

    if (args.collection !== 'payload-jobs' || context?.payload !== payload) {
      return nativeDBCreate(args);
    }

    return queueContext.run(undefined, async () => {
      const insert = () =>
        nativeDBCreate({
          ...args,
          data: { ...args.data, ...context.seed },
        });

      const { jobId } = context.seed;

      if (jobId === undefined) return insert();

      const findHolder = async () => {
        const result = await payload.db.find({
          collection: 'payload-jobs',
          where: {
            and: [
              { jobId: { equals: jobId } },
              { completedAt: { exists: false } },
              { hasError: { not_equals: true } },
            ],
          },
          limit: 1,
          pagination: false,
          req: args.req,
        });

        return result.docs[0];
      };

      const holder = await findHolder();

      if (holder) return holder;

      const operations = (payload.db as JobInsertDatabase)[jobInsertOperations];

      for (let attempt = 0; ; attempt++) {
        try {
          return await (operations
            ? operations.insert({ req: args.req as PayloadRequest | undefined, insert })
            : insert());
        } catch (error) {
          const transactionID = await args.req?.transactionID;
          const sessions = payload.db.sessions as unknown as
            Record<string, { inTransaction(): boolean }> | undefined;

          if (
            payload.db.name === 'mongoose' &&
            transactionID &&
            sessions?.[transactionID]?.inTransaction()
          ) {
            throw error;
          }

          const liveHolder = await findHolder();

          if (liveHolder) return liveHolder;

          if (attempt === 3) throw error;
        }
      }
    });
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

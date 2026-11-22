import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import {
  type Config,
  createPayloadRequest,
  type Job,
  type Payload,
  type PayloadRequest,
} from 'payload';

import { compareAndSet } from '../database/compareAndSet.js';
import { toPayloadRequest } from '../seams/request.js';
import { type JobInsertDatabase, jobInsertOperations } from './insert.js';
import { type JobLogDatabase, jobLogOperations } from './log.js';
import { getJobRunContext, isJobClaim, targetJob, withJobRun } from './run.js';
import { dropLeases, holdLease, isStopping, trackClaim, trackJobs } from './stop.js';
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

function inTransaction(session: unknown): boolean {
  return (
    typeof session === 'object' &&
    session !== null &&
    'inTransaction' in session &&
    typeof session.inTransaction === 'function' &&
    session.inTransaction() === true
  );
}

const queueContext = new AsyncLocalStorage<{ payload: Payload; seed: JobQueueSeed } | undefined>();
const runtimes = new WeakMap<Payload, Jobs>();

export function installJobsRuntime({ payload }: { payload: Payload }): Jobs {
  const installed = runtimes.get(payload);

  if (installed) return installed;

  const nativeQueue = payload.jobs.queue.bind(payload.jobs);
  const nativeRun = payload.jobs.run.bind(payload.jobs);
  const nativeRunByID = payload.jobs.runByID.bind(payload.jobs);
  const nativeCreate = payload.create.bind(payload);
  const nativeDBCreate = payload.db.create.bind(payload.db);
  const nativeUpdateJobs = payload.db.updateJobs.bind(payload.db);
  const nativeDeleteMany = payload.db.deleteMany.bind(payload.db);

  const release = (tokens: string[], req?: Parameters<typeof nativeUpdateJobs>[0]['req']) =>
    nativeUpdateJobs({
      data: { processingToken: null, processingUntil: null },
      req,
      returning: false,
      where: { processingToken: { in: tokens } },
    });

  trackJobs({ payload, release });

  const transactions = new Map<number | string, (() => void)[]>();

  const endTransaction = (end: typeof payload.db.commitTransaction): typeof end => {
    const nativeEnd = end.bind(payload.db);

    return async (id) => {
      try {
        return await nativeEnd(id);
      } finally {
        const key = await id;

        for (const resolve of transactions.get(key) ?? []) resolve();

        transactions.delete(key);
      }
    };
  };

  payload.db.commitTransaction = endTransaction(payload.db.commitTransaction);
  payload.db.rollbackTransaction = endTransaction(payload.db.rollbackTransaction);

  payload.db.updateJobs = async (args) => {
    const context = getJobRunContext();

    if (isJobClaim(args.data)) {
      const token = args.data.processingToken;
      const unclaimed = args.returning === false ? null : [];

      if (isStopping(payload)) return unclaimed;

      if (context?.payload === payload) context.tokens.add(token);

      holdLease({ payload, token });

      const transactionID = await args.req?.transactionID;
      const ended =
        transactionID === undefined
          ? undefined
          : new Promise<void>((resolve) => {
              transactions.set(transactionID, [
                ...(transactions.get(transactionID) ?? []),
                resolve,
              ]);
            });

      const claim = (async () => {
        const claimed = await nativeUpdateJobs(args);

        if (!isStopping(payload)) return claimed;

        await release([token], args.req);
        dropLeases({ payload, tokens: [token] });

        return unclaimed;
      })();

      trackClaim({ payload, settled: ended ? Promise.all([claim, ended]) : claim });

      return claim;
    }

    const target = targetJob(args);
    const rearm =
      context?.payload === payload && target.id !== undefined
        ? context.rearm.get(target.id)
        : undefined;

    if (!rearm || !args.data.completedAt) return nativeUpdateJobs(args);

    const id = target.id!;
    const req = { ...args.req, payload } as PayloadRequest;
    const operations = (payload.db as JobLogDatabase)[jobLogOperations];

    if (!operations) throw new Error('FrogBot workflow waits require job log operations.');

    const rearmed = await compareAndSet({
      req,
      collection: 'payload-jobs',
      where: {
        and: [
          { id: { equals: id } },
          ...(target.processingToken
            ? [{ processingToken: { equals: target.processingToken } }]
            : []),
          { completedAt: { exists: false } },
          { hasError: { not_equals: true } },
        ],
      },
      data: {
        completedAt: null,
        hasError: false,
        error: null,
        totalTried: 0,
        processingToken: null,
        processingUntil: null,
        waitUntil: rearm.waitUntil,
        waitpoint: rearm.waitpoint,
      },
    });

    if (!rearmed) {
      context!.rearm.delete(id);

      return nativeUpdateJobs(args);
    }

    await operations.prune({ id, keep: (rearm.log ?? []).map((entry) => entry.id), req });

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
    const context = getJobRunContext();
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
          if (
            payload.db.name === 'mongoose' &&
            transactionID &&
            inTransaction(payload.db.sessions?.[transactionID])
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
      req: await createPayloadRequest({
        payload,
        req: req && 'frogbot' in req ? toPayloadRequest(req) : req,
      }),
    });

  jobs.run = (args) => withJobRun({ payload, run: () => nativeRun(args) });

  jobs.runByID = (args) => withJobRun({ payload, run: () => nativeRunByID(args) });

  const publicJobs = jobs as Jobs;

  runtimes.set(payload, publicJobs);

  return publicJobs;
}

export function withJobsRuntime({ adapter }: { adapter: Config['db'] }): Config['db'] {
  return {
    ...adapter,
    init(args) {
      const database = adapter.init(args);

      args.payload.db = database;

      installJobsRuntime({ payload: args.payload });

      return database;
    },
  };
}

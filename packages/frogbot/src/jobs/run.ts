import { AsyncLocalStorage } from 'node:async_hooks';

import type { Job, Payload, Where } from 'payload';

import type { WaitpointReplay } from './waitpoints/types.js';

/** A `waitUntil` that runs the job now: Payload runs only jobs whose `waitUntil` is strictly before its clock. */
export function runnableNow(): string {
  return new Date(Date.now() - 1).toISOString();
}

export type ReArm = {
  waitUntil: string;
  log: Job['log'];
  waitpoint: WaitpointReplay;
};

export type JobRunContext = {
  payload: Payload;
  rearm: Map<number | string, ReArm>;
};

const runContext = new AsyncLocalStorage<JobRunContext>();

export function getJobRunContext(): JobRunContext | undefined {
  return runContext.getStore();
}

export function withJobRun<T>({ payload, run }: { payload: Payload; run: () => Promise<T> }) {
  return runContext.run({ payload, rearm: new Map() }, run);
}

/** Payload's first claim of a run: a fresh `processingToken` and lease, nothing else. */
export function isJobClaim(data: Record<string, unknown>): data is {
  processingToken: string;
  processingUntil: string;
  updatedAt?: string;
} {
  return (
    typeof data.processingToken === 'string' &&
    typeof data.processingUntil === 'string' &&
    Object.keys(data).every(
      (key) => key === 'processingToken' || key === 'processingUntil' || key === 'updatedAt',
    )
  );
}

/** A job not held by a live lease. */
export function unleased(now: string): Where {
  return {
    or: [{ processingUntil: { exists: false } }, { processingUntil: { less_than_equal: now } }],
  };
}

function findEquals(where: Where | undefined, key: string): unknown {
  if (!where) return undefined;

  const condition = where[key];

  if (condition && typeof condition === 'object' && 'equals' in condition) {
    return condition.equals;
  }

  for (const nested of Array.isArray(where.and) ? where.and : []) {
    const value = findEquals(nested, key);

    if (value !== undefined) return value;
  }

  return undefined;
}

/** The job one `updateJobs` call targets, by `id` or by Payload's lease-guarded `where`. */
export function targetJob(args: { id?: number | string; where?: Where }): {
  id?: number | string;
  processingToken?: string;
} {
  const id = args.id ?? findEquals(args.where, 'id');
  const token = findEquals(args.where, 'processingToken');

  return {
    ...(typeof id === 'string' || typeof id === 'number' ? { id } : {}),
    ...(typeof token === 'string' ? { processingToken: token } : {}),
  };
}

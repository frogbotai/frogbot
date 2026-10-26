import { AsyncLocalStorage } from 'node:async_hooks';

import type { FindArgs, Job, Payload, Where } from 'payload';

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

type ClaimedRow = { id: number | string; concurrencyKey?: null | string };

/**
 * Gives back claimed rows whose key another runner holds with a live lease; returns the rest.
 * Payload reads running keys before its claim, so only a check after the claim sees a rival's.
 */
export async function yieldHeldKeys<T extends ClaimedRow>({
  find,
  rows,
  processingToken,
  release,
}: {
  find: (args: FindArgs) => Promise<{ docs: Pick<Job, 'concurrencyKey'>[] }>;
  rows: T[];
  processingToken: string;
  release: (args: { data: Record<string, unknown>; where: Where }) => Promise<unknown>;
}): Promise<T[]> {
  const keys = [...new Set(rows.flatMap((row) => row.concurrencyKey || []))];

  if (!keys.length) return rows;

  const held = await find({
    collection: 'payload-jobs',
    limit: 0,
    pagination: false,
    select: { concurrencyKey: true },
    where: {
      and: [
        { concurrencyKey: { in: keys } },
        { processingUntil: { greater_than: new Date().toISOString() } },
        { processingToken: { not_equals: processingToken } },
      ],
    },
  });

  const heldKeys = new Set(held.docs.map((doc) => doc.concurrencyKey));
  const yielded = rows.filter((row) => row.concurrencyKey && heldKeys.has(row.concurrencyKey));

  if (!yielded.length) return rows;

  await release({
    data: { processingToken: null, processingUntil: null },
    where: {
      and: [
        { id: { in: yielded.map((row) => row.id) } },
        { processingToken: { equals: processingToken } },
      ],
    },
  });

  return rows.filter((row) => !yielded.includes(row));
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

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import type { DatabaseAdapter, Payload, PayloadRequest, Where } from 'payload';
import { createLocalReq } from 'payload';

export const DEFAULT_JOB_LEASE_DURATION = 300_000;
export const jobLeaseOperations: unique symbol = Symbol.for('frogbot.jobs.leaseOperations');

export type JobLeaseContext = {
  owner: string;
  leaseDuration: number;
  ids: Set<number | string>;
  payload: Payload;
};

export type JobLeaseMutation = {
  data: { leaseUntil: string | null; leaseOwner?: null; processing?: false };
  where: Where;
  req: PayloadRequest;
};

export type JobLeaseOperations = {
  update: (args: JobLeaseMutation) => Promise<void>;
};

export type JobLeaseDatabase = DatabaseAdapter & {
  [jobLeaseOperations]?: JobLeaseOperations;
};

const leaseContext = new AsyncLocalStorage<JobLeaseContext>();

export function getJobLeaseContext(): JobLeaseContext | undefined {
  return leaseContext.getStore();
}

export function getJobClaimFields(): { leaseOwner: string; leaseUntil: string } {
  const context = getJobLeaseContext();

  if (!context) throw new Error('FrogBot job claims require an active jobs run.');

  return {
    leaseOwner: context.owner,
    leaseUntil: new Date(Date.now() + context.leaseDuration).toISOString(),
  };
}

export function recordJobClaims(ids: (number | string)[]): void {
  const context = getJobLeaseContext();

  if (!context) throw new Error('FrogBot job claims require an active jobs run.');

  for (const id of ids) context.ids.add(id);
}

function getLeaseOperations(req: PayloadRequest): JobLeaseOperations {
  const operations = (req.payload.db as JobLeaseDatabase)[jobLeaseOperations];

  if (!operations) throw new Error('FrogBot jobs require an adapter with atomic lease operations.');

  return operations;
}

export async function renewJobLease({
  ids,
  owner,
  req,
  leaseDuration = DEFAULT_JOB_LEASE_DURATION,
}: {
  ids: (number | string)[];
  owner: string;
  req: PayloadRequest;
  leaseDuration?: number;
}): Promise<void> {
  if (!ids.length) return;

  const now = new Date();

  await getLeaseOperations(req).update({
    req,
    data: { leaseUntil: new Date(now.getTime() + leaseDuration).toISOString() },
    where: {
      and: [
        { id: { in: ids } },
        { leaseOwner: { equals: owner } },
        { processing: { equals: true } },
        { completedAt: { exists: false } },
        { leaseUntil: { greater_than: now.toISOString() } },
      ],
    },
  });
}

export async function resetJobLease({
  id,
  owner,
  leaseUntil,
  req,
}: {
  id: number | string;
  owner: string;
  leaseUntil: string;
  req: PayloadRequest;
}): Promise<void> {
  await getLeaseOperations(req).update({
    req,
    data: { processing: false, leaseOwner: null, leaseUntil: null },
    where: {
      and: [
        { id: { equals: id } },
        { leaseOwner: { equals: owner } },
        { processing: { equals: true } },
        { completedAt: { exists: false } },
        { leaseUntil: { equals: leaseUntil, less_than_equal: new Date().toISOString() } },
      ],
    },
  });
}

export async function withJobLease<T>({
  payload,
  req,
  leaseDuration,
  run,
}: {
  payload: Payload;
  req?: PayloadRequest;
  leaseDuration: number;
  run: () => Promise<T>;
}): Promise<T> {
  const leaseReq = await createLocalReq({ req: { ...req, transactionID: undefined } }, payload);

  getLeaseOperations(leaseReq);

  const context: JobLeaseContext = { owner: randomUUID(), leaseDuration, ids: new Set(), payload };

  return leaseContext.run(context, async () => {
    let renewal: Promise<void> | undefined;

    const timer = setInterval(() => {
      if (renewal) return;

      renewal = renewJobLease({
        ids: [...context.ids],
        owner: context.owner,
        req: leaseReq,
        leaseDuration,
      })
        .catch((err: unknown) =>
          payload.logger.error({ err, msg: 'FrogBot job lease renewal failed.' }),
        )
        .finally(() => {
          renewal = undefined;
        });
    }, leaseDuration / 5);

    timer.unref();

    try {
      return await run();
    } finally {
      clearInterval(timer);

      await renewal;
    }
  });
}

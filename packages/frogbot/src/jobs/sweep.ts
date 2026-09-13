import type { PayloadRequest } from 'payload';

import { resetJobLease } from './lease.js';

export const JOB_SWEEP_TASK_SLUG = 'frogbot-sweep-jobs';

type JobLeaseCandidate = {
  id: number | string;
  leaseOwner?: unknown;
  leaseUntil?: unknown;
};

export async function sweepJobLeases({ req }: { req: PayloadRequest }): Promise<void> {
  const candidates = await req.payload.db.find<JobLeaseCandidate>({
    collection: 'payload-jobs',
    req,
    limit: 0,
    pagination: false,
    select: { id: true, leaseOwner: true, leaseUntil: true },
    where: {
      and: [
        { processing: { equals: true } },
        { completedAt: { exists: false } },
        { leaseOwner: { exists: true } },
        { leaseUntil: { less_than_equal: new Date().toISOString() } },
      ],
    },
  });

  for (const candidate of candidates.docs) {
    if (typeof candidate.leaseOwner !== 'string' || typeof candidate.leaseUntil !== 'string') {
      continue;
    }

    await resetJobLease({
      id: candidate.id,
      owner: candidate.leaseOwner,
      leaseUntil: candidate.leaseUntil,
      req,
    });
  }
}

import { randomUUID } from 'node:crypto';

import type { PayloadRequest, Where } from 'payload';

import { queueWaitpointContinuation } from '../runtime.js';
import { updateWaitpoint } from './atomic.js';
import { WAITPOINTS_SLUG } from './collection.js';
import { copyResumeData } from './json.js';
import type { Waitpoint, WaitpointSnapshot } from './types.js';

const DISPATCH_LEASE_DURATION = 60_000;

export class WaitpointResumeError extends Error {
  readonly status: 404 | 409 | 410;
  readonly code: string;

  constructor({
    status,
    code,
    message,
  }: {
    status: 404 | 409 | 410;
    code: string;
    message: string;
  }) {
    super(message);

    this.name = 'WaitpointResumeError';
    this.status = status;
    this.code = code;
  }
}

export async function findWaitpoint({
  req,
  token,
  jobId,
  name,
}: {
  req: PayloadRequest;
  token?: string;
  jobId?: string;
  name?: string;
}): Promise<Waitpoint | undefined> {
  if (token !== undefined && (typeof token !== 'string' || !token)) return undefined;

  if (token === undefined && (jobId === undefined || name === undefined)) {
    throw new Error('FrogBot waitpoint lookup requires a token or a job ID and name.');
  }

  const result = await req.payload.db.find({
    collection: WAITPOINTS_SLUG,
    req,
    limit: 1,
    pagination: false,
    where:
      token === undefined
        ? { and: [{ jobId: { equals: jobId } }, { name: { equals: name } }] }
        : { token: { equals: token } },
  });

  return result.docs[0] as Waitpoint | undefined;
}

export async function createWaitpoint({
  req,
  data,
}: {
  req: PayloadRequest;
  data: Omit<Waitpoint, 'id'>;
}): Promise<Waitpoint> {
  return req.payload.db.create({
    collection: WAITPOINTS_SLUG,
    req,
    data,
  }) as Promise<Waitpoint>;
}

export async function markWaitpointReady({
  req,
  waitpoint,
  snapshot,
}: {
  req: PayloadRequest;
  waitpoint: Waitpoint;
  snapshot: WaitpointSnapshot;
}): Promise<void> {
  await updateWaitpoint({
    req,
    where: { and: [{ id: { equals: waitpoint.id } }, { ready: { equals: false } }] },
    data: { ready: true, snapshot },
  });
}

function dispatchAvailable(now: string): Where {
  return {
    or: [
      { dispatchLeaseUntil: { exists: false } },
      { dispatchLeaseUntil: { less_than_equal: now } },
    ],
  };
}

export async function dispatchWaitpoint({
  req,
  waitpoint,
}: {
  req: PayloadRequest;
  waitpoint: Waitpoint;
}): Promise<{ jobId?: number | string }> {
  const now = new Date().toISOString();

  if (waitpoint.status === 'pending') {
    await updateWaitpoint({
      req,
      where: {
        and: [
          { id: { equals: waitpoint.id } },
          { status: { equals: 'pending' } },
          ...(waitpoint.kind === 'delay'
            ? [{ kind: { equals: 'delay' } }]
            : [{ kind: { equals: 'resumable' } }, { expiresAt: { less_than_equal: now } }]),
        ],
      },
      data: { status: waitpoint.kind === 'delay' ? 'resumed' : 'expired' },
    });
  }

  const owner = randomUUID();
  const claimed = await updateWaitpoint({
    req,
    where: {
      and: [
        { id: { equals: waitpoint.id } },
        { ready: { equals: true } },
        { dispatched: { equals: false } },
        { status: { not_equals: 'pending' } },
        dispatchAvailable(now),
      ],
    },
    data: {
      dispatchOwner: owner,
      dispatchLeaseUntil: new Date(Date.now() + DISPATCH_LEASE_DURATION).toISOString(),
    },
  });

  if (!claimed) return {};

  const owned: Where = {
    and: [
      { id: { equals: waitpoint.id } },
      { dispatchOwner: { equals: owner } },
      { dispatched: { equals: false } },
    ],
  };

  let renewal: Promise<void> | undefined;
  let leaseLost = false;
  const timer = setInterval(() => {
    if (renewal) return;

    renewal = updateWaitpoint({
      req,
      where: owned,
      data: { dispatchLeaseUntil: new Date(Date.now() + DISPATCH_LEASE_DURATION).toISOString() },
    })
      .then((renewed) => {
        if (!renewed) leaseLost = true;
      })
      .catch((err: unknown) => {
        leaseLost = true;

        req.payload.logger.error({ err, msg: 'FrogBot waitpoint dispatch lease renewal failed.' });
      })
      .finally(() => {
        renewal = undefined;
      });
  }, DISPATCH_LEASE_DURATION / 5);

  timer.unref();

  try {
    const current = await findWaitpoint({ req, token: waitpoint.token });

    if (!current || current.dispatchOwner !== owner || leaseLost) {
      throw new Error('FrogBot waitpoint dispatch claim was lost.');
    }

    const existing = await req.payload.db.find({
      collection: 'payload-jobs',
      req,
      limit: 1,
      pagination: false,
      where: { jobId: { equals: `frogbot-waitpoint:${current.token}` } },
    });

    const job = existing.docs[0] ?? (await queueWaitpointContinuation({ req, waitpoint: current }));
    const marked = await updateWaitpoint({
      req,
      where: owned,
      data: { dispatched: true, dispatchOwner: null, dispatchLeaseUntil: null },
    });

    if (!marked) throw new Error('FrogBot waitpoint dispatch claim was lost.');

    return { jobId: job.id };
  } catch (error) {
    await updateWaitpoint({
      req,
      where: owned,
      data: { dispatchOwner: null, dispatchLeaseUntil: null },
    }).catch((err: unknown) => {
      req.payload.logger.error({ err, msg: 'FrogBot waitpoint dispatch claim release failed.' });
    });

    throw error;
  } finally {
    clearInterval(timer);

    await renewal;
  }
}

export async function resumeWaitpoint({
  req,
  token,
  data,
}: {
  req: PayloadRequest;
  token: string;
  data: unknown;
}): Promise<{ jobId?: number | string }> {
  const value = copyResumeData(data);
  const waitpoint = await findWaitpoint({ req, token });

  if (!waitpoint) {
    throw new WaitpointResumeError({
      status: 404,
      code: 'WAITPOINT_NOT_FOUND',
      message: 'This FrogBot waitpoint was not found.',
    });
  }

  const now = new Date().toISOString();
  const accepted = await updateWaitpoint({
    req,
    where: {
      and: [
        { id: { equals: waitpoint.id } },
        { kind: { equals: 'resumable' } },
        { status: { equals: 'pending' } },
        { expiresAt: { greater_than: now } },
      ],
    },
    data: { status: 'resumed', data: value },
  });

  if (!accepted) {
    const current = await findWaitpoint({ req, token });
    const expired =
      current?.status === 'expired' ||
      (current?.status === 'pending' && !!current.expiresAt && current.expiresAt <= now);

    throw new WaitpointResumeError({
      status: expired ? 410 : 409,
      code: expired ? 'WAITPOINT_EXPIRED' : 'WAITPOINT_CONSUMED',
      message: expired
        ? 'This FrogBot waitpoint has expired.'
        : 'This FrogBot waitpoint cannot be resumed.',
    });
  }

  if (!waitpoint.ready) return {};

  return dispatchWaitpoint({ req, waitpoint: { ...waitpoint, status: 'resumed', data: value } });
}

export async function sweepWaitpoints({ req }: { req: PayloadRequest }): Promise<void> {
  const now = new Date().toISOString();
  const failures: unknown[] = [];
  let after: number | string | undefined;

  while (true) {
    const result = await req.payload.db.find({
      collection: WAITPOINTS_SLUG,
      req,
      sort: 'id',
      limit: 100,
      pagination: false,
      where: {
        and: [
          { dispatched: { equals: false } },
          dispatchAvailable(now),
          ...(after === undefined ? [] : [{ id: { greater_than: after } }]),
          {
            or: [
              { kind: { equals: 'delay' } },
              { status: { not_equals: 'pending' } },
              { expiresAt: { less_than_equal: now } },
            ],
          },
        ],
      },
    });

    for (const doc of result.docs) {
      try {
        await dispatchWaitpoint({ req, waitpoint: doc as Waitpoint });
      } catch (error) {
        failures.push(error);
      }
    }

    if (result.docs.length < 100) break;

    after = result.docs[result.docs.length - 1].id;
  }

  if (failures.length) throw new AggregateError(failures, 'FrogBot waitpoint dispatch failed.');
}

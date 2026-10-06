import { randomBytes } from 'node:crypto';

import type { Job, PayloadRequest } from 'payload';

import { type ReArm, runnableNow } from '../lease.js';
import { updateWaitpoint } from './atomic.js';
import { isReservedWaitpointKey } from './json.js';
import {
  createWaitpoint,
  dispatchWaitpoint,
  findWaitpoint,
  markWaitpointReady,
} from './operations.js';
import type { WaitFor, Waitpoint, WaitpointOptions, WaitpointReplay } from './types.js';

type WaitOptions =
  | { until: Date | string; onWait?: never; expiresIn?: never }
  | {
      until?: never;
      expiresIn?: number;
      onWait: (args: { resumeUrl: string }) => void | Promise<void>;
    };

function waitDeadline({
  options,
  config,
}: {
  options: WaitOptions;
  config: WaitpointOptions;
}): Pick<Waitpoint, 'kind' | 'until' | 'expiresAt'> {
  if (options.until !== undefined) {
    if (options.onWait !== undefined || options.expiresIn !== undefined) {
      throw new Error('FrogBot waitFor accepts either until or onWait, not both.');
    }

    const until = new Date(options.until);

    if (!Number.isFinite(until.getTime())) {
      throw new Error('FrogBot waitFor until must be a valid date.');
    }

    if (until.getTime() > Date.parse('9999-12-31T23:59:59.999Z')) {
      throw new Error('FrogBot waitFor until must be on or before 9999-12-31T23:59:59.999Z.');
    }

    return { kind: 'delay', until: until.toISOString() };
  }

  if (typeof options.onWait !== 'function') {
    throw new Error('FrogBot waitFor requires until or an onWait callback.');
  }

  const expiresIn = options.expiresIn ?? config.defaultExpiresIn;
  const expiresAt = new Date(Date.now() + expiresIn);

  if (
    !Number.isSafeInteger(expiresIn) ||
    expiresIn <= 0 ||
    expiresIn > config.maxExpiresIn ||
    !Number.isFinite(expiresAt.getTime())
  ) {
    throw new Error(
      `FrogBot waitFor expiresIn must be a positive integer up to ${config.maxExpiresIn} milliseconds.`,
    );
  }

  if (expiresAt.getTime() > Date.parse('9999-12-31T23:59:59.999Z')) {
    throw new Error('FrogBot waitFor expiresAt must be on or before 9999-12-31T23:59:59.999Z.');
  }

  return { kind: 'resumable', expiresAt: expiresAt.toISOString() };
}

function resumeURL({ req, token }: { req: PayloadRequest; token: string }): string {
  const { serverURL, routes } = req.payload.config;
  const base = serverURL || (req.url ? new URL(req.url).origin : undefined);

  if (!base) throw new Error('FrogBot waitFor requires serverURL to generate a resume URL.');

  return `${base.replace(/\/$/, '')}${routes.api}/jobs/${token}/resume`;
}

export function createWaitFor({
  job,
  req,
  config,
}: {
  job: Job;
  req: PayloadRequest;
  config: WaitpointOptions;
}): { waitFor: WaitFor; isWaiting: (error: unknown) => boolean; getReArm: () => ReArm } {
  if (!job.workflowSlug) throw new Error('FrogBot waitFor requires a workflow job.');

  const replay = (job as Job & { waitpoint?: WaitpointReplay | null }).waitpoint;
  const jobId = replay?.jobId ?? String(job.id);
  const results = { ...replay?.results };
  const names = new Set<string>();
  const signal = Symbol('FrogBot workflow waiting');
  let waitUntil: string;
  let waiting: string;

  const waitFor = async (name: string, options: WaitOptions) => {
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('FrogBot waitFor name must be a nonempty string.');
    }

    if (isReservedWaitpointKey(name)) {
      throw new Error(`FrogBot waitFor name '${name}' is reserved.`);
    }

    if (names.has(name)) throw new Error(`FrogBot waitFor name '${name}' is duplicated.`);

    names.add(name);

    const kind = options.until === undefined ? 'resumable' : 'delay';

    if (Object.hasOwn(results, name)) {
      const result = results[name];

      if ((result === null) !== (kind === 'delay')) {
        throw new Error(`FrogBot waitFor '${name}' changed its wait kind during replay.`);
      }

      return result === null ? undefined : structuredClone(result);
    }

    let waitpoint = await findWaitpoint({ req, jobId, name });
    const replaying = waitpoint?.ready === true;

    if (waitpoint && waitpoint.kind !== kind) {
      throw new Error(`FrogBot waitFor '${name}' changed its wait kind during replay.`);
    }

    if (!waitpoint) {
      const deadline = waitDeadline({ options, config });
      const token = randomBytes(32).toString('base64url');

      if (deadline.kind === 'resumable') resumeURL({ req, token });

      waitpoint = await createWaitpoint({
        req,
        data: {
          jobId,
          holder: job.id,
          name,
          token,
          ...deadline,
          ready: false,
          status: deadline.kind === 'delay' ? 'resumed' : 'pending',
          dispatched: deadline.kind === 'delay',
        },
      });
    }

    if (!waitpoint.ready) {
      if (options.onWait) {
        await options.onWait({ resumeUrl: resumeURL({ req, token: waitpoint.token }) });
      }

      await markWaitpointReady({ req, waitpoint });

      waitpoint = await findWaitpoint({ req, token: waitpoint.token });

      if (!waitpoint) throw new Error(`FrogBot waitFor '${name}' disappeared before dispatch.`);
    }

    if (
      waitpoint.kind === 'resumable' &&
      waitpoint.status === 'pending' &&
      Date.parse(waitpoint.expiresAt!) <= Date.now()
    ) {
      await updateWaitpoint({
        req,
        where: {
          and: [
            { id: { equals: waitpoint.id } },
            { kind: { equals: 'resumable' } },
            { status: { equals: 'pending' } },
            { expiresAt: { less_than_equal: new Date().toISOString() } },
          ],
        },
        data: { status: 'expired' },
      });

      waitpoint = await findWaitpoint({ req, token: waitpoint.token });

      if (!waitpoint) throw new Error(`FrogBot waitFor '${name}' disappeared before replay.`);
    }

    if (
      replaying &&
      (waitpoint.kind === 'delay'
        ? Date.parse(waitpoint.until!) <= Date.now()
        : waitpoint.status === 'resumed' || waitpoint.status === 'expired')
    ) {
      const result =
        waitpoint.kind === 'delay'
          ? null
          : waitpoint.status === 'expired'
            ? { expired: true as const }
            : { expired: false as const, data: waitpoint.data };

      results[name] = structuredClone(result);

      if (!waitpoint.dispatched) {
        await updateWaitpoint({
          req,
          where: { and: [{ id: { equals: waitpoint.id } }, { dispatched: { equals: false } }] },
          data: { dispatched: true },
        });
      }

      return result === null ? undefined : structuredClone(result);
    }

    if (waitpoint.kind !== 'delay') await dispatchWaitpoint({ req, waitpoint });

    waitUntil =
      waitpoint.kind === 'delay'
        ? waitpoint.until!
        : waitpoint.status === 'pending'
          ? waitpoint.expiresAt!
          : runnableNow();

    waiting = name;

    throw signal;
  };

  return {
    waitFor: waitFor as WaitFor,
    isWaiting: (error) => error === signal,
    getReArm: () => ({
      waitUntil,
      log: structuredClone(
        (job.log ?? []).filter(
          ({ state, taskSlug }) => state === 'succeeded' && taskSlug === 'inline',
        ),
      ),
      waitpoint: { jobId, results: structuredClone(results), waiting },
    }),
  };
}

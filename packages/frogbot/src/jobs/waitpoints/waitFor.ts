import { randomBytes } from 'node:crypto';

import type { Job, JsonObject, PayloadRequest } from 'payload';

import { isReservedWaitpointKey } from './json.js';
import {
  createWaitpoint,
  dispatchWaitpoint,
  findWaitpoint,
  markWaitpointReady,
} from './operations.js';
import type {
  WaitFor,
  Waitpoint,
  WaitpointOptions,
  WaitpointReplay,
  WaitpointSnapshot,
} from './types.js';

type WaitOptions =
  | { until: Date | string; onWait?: never; expiresIn?: never }
  | {
      until?: never;
      expiresIn?: number;
      onWait: (args: { resumeUrl: string }) => void | Promise<void>;
    };

function snapshotJob({
  job,
  results,
}: {
  job: Job;
  results: WaitpointReplay['results'];
}): WaitpointSnapshot {
  if (!job.workflowSlug) throw new Error('FrogBot waitFor requires a workflow job.');

  return structuredClone({
    workflow: job.workflowSlug,
    input: job.input as JsonObject,
    queue: job.queue ?? 'default',
    log: (job.log ?? []).filter(
      ({ state, taskSlug }) => state === 'succeeded' && taskSlug === 'inline',
    ),
    meta: job.meta,
    results,
  });
}

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
}): { waitFor: WaitFor; isWaiting: (error: unknown) => boolean } {
  const replay = (job as Job & { waitpoint?: WaitpointReplay | null }).waitpoint;
  const jobId = replay?.jobId ?? String(job.id);
  const results = { ...replay?.results };
  const names = new Set<string>();
  const signal = Symbol('FrogBot workflow waiting');

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
          name,
          token,
          ...deadline,
          ready: false,
          status: 'pending',
          snapshot: snapshotJob({ job, results }),
          dispatched: false,
        },
      });
    }

    if (!waitpoint.ready) {
      if (options.onWait) {
        await options.onWait({ resumeUrl: resumeURL({ req, token: waitpoint.token }) });
      }

      await markWaitpointReady({ req, waitpoint, snapshot: snapshotJob({ job, results }) });

      waitpoint = await findWaitpoint({ req, token: waitpoint.token });

      if (!waitpoint) throw new Error(`FrogBot waitFor '${name}' disappeared before dispatch.`);
    }

    await dispatchWaitpoint({ req, waitpoint });

    throw signal;
  };

  return { waitFor: waitFor as WaitFor, isWaiting: (error) => error === signal };
}

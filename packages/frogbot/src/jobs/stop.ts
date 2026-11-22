import type { Job, Payload } from 'payload';

type JobsStopState = {
  held: Set<string>;
  claims: Set<Promise<unknown>>;
  release: (tokens: string[]) => Promise<unknown>;
  stopped?: Promise<void>;
};

const SIGNALS = ['SIGTERM', 'SIGINT'] as const;
const EXIT_GRACE_MS = 2000;

const states = new WeakMap<Payload, JobsStopState>();
const servers = new Set<Payload>();
let watching = false;

function onSignal(signal: NodeJS.Signals) {
  const alone = process.listenerCount(signal) === 1;

  for (const name of SIGNALS) process.off(name, onSignal);

  watching = false;

  const stopped = Promise.allSettled([...servers].map((payload) => stopJobs({ payload })));
  let timer: NodeJS.Timeout | undefined;
  const grace = new Promise((resolve) => {
    timer = setTimeout(resolve, EXIT_GRACE_MS);
  });

  const settled = Promise.race([stopped, grace]).finally(() => clearTimeout(timer));
  const exit = process.exit.bind(process);

  process.exit = ((code) => {
    void settled.then(() => exit(code));
  }) as typeof process.exit;

  if (alone) void settled.then(() => process.kill(process.pid, signal));
}

function watchSignals(payload: Payload) {
  servers.add(payload);

  if (watching) return;

  watching = true;

  for (const name of SIGNALS) process.prependListener(name, onSignal);
}

/** Starts tracking the job leases `payload` claims; `release` clears the leases with these tokens. */
export function trackJobs({
  payload,
  release,
}: {
  payload: Payload;
  release: JobsStopState['release'];
}): void {
  states.set(payload, { held: new Set(), claims: new Set(), release });
}

/** Whether {@link stopJobs} has run for `payload`, so it must not claim jobs. */
export function isStopping(payload: Payload): boolean {
  return states.get(payload)?.stopped !== undefined;
}

/**
 * Keeps a job from starting once `payload` is stopping, because its lease was given back and
 * another server runs it. Clearing the token makes Payload drop the job as it does after a lost
 * lease, without writing to it.
 */
export function assertNotStopping({ payload, job }: { payload: Payload; job: Job }): void {
  if (!isStopping(payload)) return;

  job.processingToken = null;

  throw new Error(`Job ${job.id} was given back to the queue because this server is stopping.`);
}

/**
 * Records a lease `payload` claimed. A process running autoRun gives its leases back on SIGTERM or
 * SIGINT, before it exits.
 */
export function holdLease({ payload, token }: { payload: Payload; token: string }): void {
  states.get(payload)?.held.add(token);

  if (payload.crons.length) watchSignals(payload);
}

/**
 * Makes {@link stopJobs} wait for a claim until `settled`, when its transaction has committed or
 * rolled back, so the release never misses a claim it can't see yet.
 */
export function trackClaim({ payload, settled }: { payload: Payload; settled: Promise<unknown> }) {
  const claims = states.get(payload)?.claims;
  const pending = settled.catch(() => undefined);

  claims?.add(pending);

  void pending.then(() => claims?.delete(pending));
}

/** Forgets leases whose run has finished. */
export function dropLeases({ payload, tokens }: { payload: Payload; tokens: Iterable<string> }) {
  const state = states.get(payload);

  for (const token of tokens) state?.held.delete(token);
}

/**
 * Stops `payload`'s job runner: its autoRun crons stop, it claims no more jobs, and the leases it
 * holds are cleared, so the next server runs those jobs on its next tick instead of after the lease.
 * A job cut off mid-run repeats its work, as it would after its lease ran out.
 */
export function stopJobs({ payload }: { payload: Payload }): Promise<void> {
  const state = states.get(payload);

  if (!state) return Promise.resolve();

  state.stopped ??= (async () => {
    for (const cron of payload.crons.splice(0)) cron.stop();

    await Promise.allSettled(state.claims);

    const tokens = [...state.held];

    state.held.clear();

    if (tokens.length) await state.release(tokens);
  })();

  return state.stopped;
}

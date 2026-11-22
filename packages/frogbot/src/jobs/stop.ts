import type { Payload } from 'payload';

type JobsStopState = {
  held: Set<string>;
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
  const grace = new Promise((resolve) => setTimeout(resolve, EXIT_GRACE_MS).unref());
  const settled = Promise.race([stopped, grace]);
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

  for (const name of SIGNALS) process.on(name, onSignal);
}

/** Starts tracking the job leases `payload` claims; `release` clears the leases with these tokens. */
export function trackJobs({
  payload,
  release,
}: {
  payload: Payload;
  release: JobsStopState['release'];
}): void {
  states.set(payload, { held: new Set(), release });
}

/** Whether {@link stopJobs} has run for `payload`, so it must not claim jobs. */
export function isStopping(payload: Payload): boolean {
  return states.get(payload)?.stopped !== undefined;
}

/**
 * Records a lease `payload` claimed. A process running autoRun gives its leases back on SIGTERM or
 * SIGINT, before it exits.
 */
export function holdLease({ payload, token }: { payload: Payload; token: string }): void {
  states.get(payload)?.held.add(token);

  if (payload.crons.length) watchSignals(payload);
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

    const tokens = [...state.held];

    state.held.clear();

    if (tokens.length) await state.release(tokens);
  })();

  return state.stopped;
}

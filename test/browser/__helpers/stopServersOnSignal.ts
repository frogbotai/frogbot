const SIGNALS = [
  ['SIGTERM', 143],
  ['SIGHUP', 129],
] as const;

const INSTALLED = Symbol.for('frogbot.stopServersOnSignal');

// Playwright stops its web servers from an `exit` handler. A SIGTERM or SIGHUP with no listener
// ends the runner without running it, so `next start` and the fake provider keep their ports and
// the next run fails with "already used". Exiting on the signal runs that handler.
export function stopServersOnSignal(target: NodeJS.Process = process) {
  const marked = target as NodeJS.Process & { [INSTALLED]?: true };

  if (marked[INSTALLED]) return;

  marked[INSTALLED] = true;

  for (const [signal, code] of SIGNALS) target.once(signal, () => target.exit(code));
}

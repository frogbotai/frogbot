const SIGNALS = [
  ['SIGTERM', 143],
  ['SIGHUP', 129],
] as const;

const INSTALLED = Symbol.for('frogbot.stopServersOnSignal');

export function stopServersOnSignal(target: NodeJS.Process = process) {
  const marked = target as NodeJS.Process & { [INSTALLED]?: true };

  if (marked[INSTALLED]) return;

  marked[INSTALLED] = true;

  for (const [signal, code] of SIGNALS) target.once(signal, () => target.exit(code));
}

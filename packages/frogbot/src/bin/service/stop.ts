import { isAlive } from './registration.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function signal(pid: number, name: NodeJS.Signals, group: boolean): void {
  try {
    process.kill(group ? -pid : pid, name);
  } catch (error) {
    if (group && (error as NodeJS.ErrnoException).code === 'ESRCH') signal(pid, name, false);
  }
}

/**
 * `SIGTERM`, then polls every `interval` ms for `timeout` ms, then `SIGKILL`. `group` signals the
 * process's whole group, as a server's `next start` child is in its group.
 */
export async function stopProcess(
  pid: number | undefined,
  { timeout = 5000, interval = 50, group = false } = {},
): Promise<'not running' | 'stopped' | 'killed'> {
  if (!pid || !isAlive(pid)) return 'not running';

  signal(pid, 'SIGTERM', group);

  for (let waited = 0; waited < timeout; waited += interval) {
    await sleep(interval);

    if (!isAlive(pid)) return 'stopped';
  }

  signal(pid, 'SIGKILL', group);

  for (let waited = 0; waited < 1000 && isAlive(pid); waited += interval) await sleep(interval);

  return 'killed';
}

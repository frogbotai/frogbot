import { execFileSync } from 'node:child_process';

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

function commandLine(pid: number): string {
  try {
    return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
  } catch {
    return '';
  }
}

/**
 * `pid` when it is still alive and still the app's server: its command line names `next-server` or
 * the app's folder, so a pid the OS has given to another program is never touched.
 */
export function leftServer(pid: number | undefined, dir: string): number | undefined {
  if (!pid || !isAlive(pid)) return undefined;

  const command = commandLine(pid);

  return command.includes('next-server') || command.includes(dir) ? pid : undefined;
}

/** Stops a server a previous supervisor of `dir` left running, with its process group. */
export async function stopLeftServer(pid: number | undefined, dir: string): Promise<boolean> {
  const left = leftServer(pid, dir);

  if (!left) return false;

  await stopProcess(left, { group: true });

  return true;
}

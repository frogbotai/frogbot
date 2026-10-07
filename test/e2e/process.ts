import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { vi } from 'vitest';

const guardian = fileURLToPath(new URL('./guardian.mjs', import.meta.url));
const live = new Set<ChildProcess>();

function killGroup(child: ChildProcess): void {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {}
}

process.once('exit', () => live.forEach(killGroup));

/**
 * Spawn a long-running server (for example `next dev`) for a test.
 *
 * The command runs under `guardian.mjs` in its own process group. The whole
 * group, including grandchildren such as `next-server`, is killed when this
 * test process exits for any reason, even SIGKILL. Always pair it with
 * `terminateProcess` in `afterAll`/`finally`.
 */
export function spawnServer(
  command: string,
  args: readonly string[],
  options: Omit<SpawnOptions, 'detached' | 'stdio'> & {
    stdout?: 'ignore' | 'pipe' | 'inherit';
    stderr?: 'ignore' | 'pipe' | 'inherit';
  } = {},
): ChildProcess {
  const { stdout = 'pipe', stderr = 'pipe', ...rest } = options;
  const child = spawn(process.execPath, [guardian, command, ...args], {
    ...rest,
    detached: true,
    stdio: ['pipe', stdout, stderr],
  });

  live.add(child);
  child.once('exit', () => live.delete(child));

  return child;
}

/**
 * Kill a spawned server's entire process group and wait for it to close.
 * Kills the group even if the leader already exited, since grandchildren
 * such as `next-server` can outlive it.
 */
export async function terminateProcess(child?: ChildProcess): Promise<void> {
  if (!child?.pid) return;
  const closed =
    child.exitCode === null && child.signalCode === null
      ? new Promise<void>((resolve) => child.once('close', () => resolve()))
      : Promise.resolve();

  killGroup(child);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  await closed;
  live.delete(child);
}

/**
 * Poll `ready` until it resolves true, failing as soon as the server exits.
 * `output` adds the server's logs to the failure message.
 */
export async function waitForServer(
  child: ChildProcess,
  ready: () => Promise<boolean>,
  {
    name,
    timeout,
    interval,
    output = () => '',
  }: { name: string; timeout: number; interval: number; output?: () => string },
): Promise<void> {
  const exited = () => child.exitCode !== null;
  const details = () => (output() ? `:\n${output()}` : '');

  await vi.waitFor(
    async () => {
      if (exited()) return;
      if (!(await ready())) throw new Error(`${name} did not become ready${details()}`);
    },
    { timeout, interval },
  );

  if (exited()) throw new Error(`${name} exited with code ${child.exitCode}${details()}`);
}

/** Ask the OS for a free TCP port instead of hard-coding one. */
export function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address !== 'object' || !address) {
        reject(new Error('could not resolve a free port'));

        return;
      }

      server.close(() => resolvePort(address.port));
    });
  });
}

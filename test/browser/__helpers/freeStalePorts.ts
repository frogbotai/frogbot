import { execFileSync } from 'node:child_process';
import path from 'node:path';

const GRACE_MS = 5_000;
const POLL_MS = 100;

function run(args: string[]): string {
  try {
    return execFileSync('lsof', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (error) {
    const { stdout } = error as { stdout?: unknown };

    return typeof stdout === 'string' ? stdout : '';
  }
}

function listeners(ports: number[]): number[] {
  const output = run([
    '-nP',
    '-t',
    '-sTCP:LISTEN',
    ...ports.flatMap((port) => ['-i', `TCP:${port}`]),
  ]);

  return [...new Set(output.split('\n').filter(Boolean).map(Number))];
}

function cwdOf(pid: number): string | undefined {
  return run(['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])
    .split('\n')
    .find((line) => line.startsWith('n'))
    ?.slice(1);
}

function isInside(directory: string, root: string): boolean {
  const relative = path.relative(root, directory);

  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function pause(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Stops servers still listening on this checkout's browser test ports, left behind when an
 * earlier run was killed before Playwright could stop them. Only processes whose working
 * directory is inside `root` are touched, so other checkouts and unrelated apps are safe.
 */
export function freeStalePorts(ports: number[], root: string): number[] {
  if (process.platform === 'win32' || ports.length === 0) return [];

  const stale = listeners(ports).filter((pid) => {
    const cwd = cwdOf(pid);

    return cwd !== undefined && isInside(cwd, root);
  });

  for (const pid of stale) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }

  const holding = () => listeners(ports).filter((pid) => stale.includes(pid));

  for (let waited = 0; waited < GRACE_MS && holding().length > 0; waited += POLL_MS) {
    pause(POLL_MS);
  }

  for (const pid of holding()) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
  }

  if (stale.length > 0) {
    process.stdout.write(
      `[browser] stopped ${stale.length} stale test server(s) from an earlier run\n`,
    );
  }

  return stale;
}

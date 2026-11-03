import type { ChildProcess } from 'node:child_process';

import { HOST } from './ports.js';

export const HEALTH_MS = 60_000;

const CHECKS: { path: string; ok: (status: number) => boolean; skip?: number }[] = [
  { path: '/', ok: (status) => status < 500 },
  { path: '/admin', ok: (status) => status < 500 },
  { path: '/api/health', ok: (status) => status === 200, skip: 404 },
  { path: '/api/access', ok: (status) => status < 500 },
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const gone = (child: ChildProcess) => child.exitCode !== null || child.signalCode !== null;

function status(port: number, path: string): Promise<number | undefined> {
  return fetch(`http://${HOST}:${port}${path}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  }).then(
    async (response) => {
      await response.body?.cancel();

      return response.status;
    },
    () => undefined,
  );
}

/**
 * Resolves once the server on `port` answers what a live app must: `/` and the admin below 500, the
 * health route with 200 (skipped when the app has none), and the API catch-all below 500. Throws on
 * the first that fails.
 */
export async function checkHealth(
  port: number,
  child: ChildProcess,
  timeout = HEALTH_MS,
): Promise<void> {
  const deadline = Date.now() + timeout;

  for (const check of CHECKS) {
    for (;;) {
      if (gone(child)) {
        throw new Error(`the server exited (${child.signalCode ?? `exit ${child.exitCode}`})`);
      }

      if (Date.now() > deadline) {
        throw new Error(`the server didn't answer ${check.path} within ${timeout / 1000} s`);
      }

      const answer = await status(port, check.path);

      if (answer !== undefined && (answer === check.skip || check.ok(answer))) break;
      if (answer !== undefined) throw new Error(`the server answered ${check.path} with ${answer}`);

      await sleep(200);
    }
  }
}

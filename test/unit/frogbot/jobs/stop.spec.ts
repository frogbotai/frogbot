import type { Payload } from 'payload';
import { afterEach, expect, it, vi } from 'vitest';

import {
  dropLeases,
  holdLease,
  isStopping,
  stopJobs,
  trackJobs,
} from '../../../../packages/frogbot/src/jobs/stop.js';

const exit = process.exit;

afterEach(() => {
  process.exit = exit;
});

function server({ crons = 1 } = {}) {
  const stop = vi.fn();
  const payload = { crons: Array.from({ length: crons }, () => ({ stop })) } as unknown as Payload;
  let finish!: () => void;
  const released = new Promise<void>((resolve) => {
    finish = resolve;
  });

  const release = vi.fn((tokens: string[]) => released.then(() => tokens));

  trackJobs({ payload, release });

  return { payload, release, stop, finish };
}

it('stopJobs stops autoRun, blocks claims and releases only the leases still held', async () => {
  const { payload, release, stop, finish } = server();

  holdLease({ payload, token: 'running' });
  holdLease({ payload, token: 'finished' });
  dropLeases({ payload, tokens: ['finished'] });

  const stopped = stopJobs({ payload });

  expect(isStopping(payload)).toBe(true);
  expect(stop).toHaveBeenCalledOnce();
  expect(payload.crons).toHaveLength(0);

  finish();

  await stopped;
  await stopJobs({ payload });

  expect(release).toHaveBeenCalledExactlyOnceWith(['running']);
});

it('SIGTERM in a process running autoRun holds process.exit until the leases are released', async () => {
  const { payload, release, finish } = server();
  const exited = vi.fn();
  const other = () => void Promise.resolve().then(() => process.exit(143));

  process.exit = exited as unknown as typeof process.exit;
  process.on('SIGTERM', other);

  holdLease({ payload, token: 'running' });
  process.emit('SIGTERM', 'SIGTERM');
  process.off('SIGTERM', other);

  await vi.waitFor(() => expect(release).toHaveBeenCalledWith(['running']));

  expect(exited).not.toHaveBeenCalled();

  finish();

  await vi.waitFor(() => expect(exited).toHaveBeenCalledWith(143));

  expect(process.listenerCount('SIGINT')).toBe(0);
});

it('a process without autoRun keeps its own signal handling', () => {
  const { payload } = server({ crons: 0 });
  const before = process.listenerCount('SIGTERM');

  holdLease({ payload, token: 'cli' });

  expect(process.listenerCount('SIGTERM')).toBe(before);
});

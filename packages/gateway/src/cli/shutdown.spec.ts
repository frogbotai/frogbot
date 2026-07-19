import { afterEach, describe, expect, it, vi } from 'vitest';

import { installGracefulShutdown } from './index.js';

type CloseCb = (err?: Error) => void;

function makeServer() {
  let closeCb: CloseCb | undefined;
  return {
    close: vi.fn((cb?: CloseCb) => {
      closeCb = cb;
    }),
    finishDrain: (err?: Error) => closeCb?.(err),
  };
}

describe('installGracefulShutdown (G91)', () => {
  afterEach(() => {
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    vi.useRealTimers();
  });

  // On SIGTERM the handler must stop accepting new connections, wait for the
  // drain callback, flush the exporter, then exit 0 — not force-exit mid-stream.
  it('drains connections, flushes, then exits 0', async () => {
    const server = makeServer();
    const exit = vi.fn();
    const flush = vi.fn(() => Promise.resolve());

    const handler = installGracefulShutdown({
      server,
      flush,
      exit: exit as unknown as (code: number) => never,
      log: () => {},
      errorLog: () => {},
    });

    handler('SIGTERM');
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();

    server.finishDrain();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(flush).toHaveBeenCalledTimes(1);
  });

  // If the drain never completes, the hard timeout must force exit 1 so a
  // wedged connection can't hang past the grace period.
  it('force-exits 1 when the drain never completes', () => {
    vi.useFakeTimers();
    const server = makeServer();
    const exit = vi.fn();

    const handler = installGracefulShutdown({
      server,
      drainTimeoutMs: 25_000,
      exit: exit as unknown as (code: number) => never,
      log: () => {},
      errorLog: () => {},
    });

    handler('SIGTERM');
    expect(exit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(25_000);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('exits 1 when server.close reports an error', () => {
    const server = makeServer();
    const exit = vi.fn();
    const flush = vi.fn(() => Promise.resolve());

    const handler = installGracefulShutdown({
      server,
      flush,
      exit: exit as unknown as (code: number) => never,
      log: () => {},
      errorLog: () => {},
    });

    handler('SIGTERM');
    server.finishDrain(new Error('boom'));
    expect(exit).toHaveBeenCalledWith(1);
    expect(flush).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';

import { gracefulShutdown } from './setup.js';

describe('gracefulShutdown', () => {
  it('force-flushes then shuts down the provider', async () => {
    const order: string[] = [];
    const provider = {
      forceFlush: vi.fn(async () => { order.push('forceFlush'); }),
      shutdown: vi.fn(async () => { order.push('shutdown'); }),
    };

    await gracefulShutdown(provider, 10_000);

    expect(provider.forceFlush).toHaveBeenCalledOnce();
    expect(provider.shutdown).toHaveBeenCalledOnce();
    expect(order).toEqual(['forceFlush', 'shutdown']);
  });

  it('does not hang when forceFlush never resolves — the timeout wins and shutdown still runs', async () => {
    vi.useFakeTimers();
    try {
      const provider = {
        forceFlush: vi.fn(() => new Promise<void>(() => {})),
        shutdown: vi.fn(async () => {}),
      };

      const done = gracefulShutdown(provider, 10_000);
      await vi.advanceTimersByTimeAsync(10_000);
      await done;

      expect(provider.forceFlush).toHaveBeenCalledOnce();
      expect(provider.shutdown).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('still shuts down when forceFlush rejects', async () => {
    const provider = {
      forceFlush: vi.fn(async () => { throw new Error('exporter down'); }),
      shutdown: vi.fn(async () => {}),
    };

    await expect(gracefulShutdown(provider, 10_000)).resolves.toBeUndefined();
    expect(provider.shutdown).toHaveBeenCalledOnce();
  });

  it('swallows a shutdown rejection so the caller can still exit', async () => {
    const provider = {
      forceFlush: vi.fn(async () => {}),
      shutdown: vi.fn(async () => { throw new Error('shutdown failed'); }),
    };

    await expect(gracefulShutdown(provider, 10_000)).resolves.toBeUndefined();
  });
});

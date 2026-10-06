import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { gracefulShutdown } from '../../../../packages/gateway/src/observability/setup.js';

describe('gracefulShutdown', () => {
  it('force-flushes then shuts down the provider', async () => {
    const order: string[] = [];
    const provider = {
      forceFlush: vi.fn(() => {
        order.push('forceFlush');
        return Promise.resolve();
      }),
      shutdown: vi.fn(() => {
        order.push('shutdown');
        return Promise.resolve();
      }),
    };

    await gracefulShutdown(provider, 10_000);

    expect(provider.forceFlush).toHaveBeenCalledOnce();
    expect(provider.shutdown).toHaveBeenCalledOnce();
    expect(order).toEqual(['forceFlush', 'shutdown']);
  });

  it('does not hang when forceFlush never resolves — the timeout wins and shutdown still runs', async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const provider = {
      forceFlush: vi.fn(() => new Promise<void>(() => {})),
      shutdown: vi.fn(async () => {}),
    };

    const done = gracefulShutdown(provider, 10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    await done;

    expect(provider.forceFlush).toHaveBeenCalledOnce();
    expect(provider.shutdown).toHaveBeenCalledOnce();
  });

  it('still shuts down when forceFlush rejects', async () => {
    const provider = {
      forceFlush: vi.fn(() => Promise.reject(new Error('exporter down'))),
      shutdown: vi.fn(async () => {}),
    };

    await expect(gracefulShutdown(provider, 10_000)).resolves.toBeUndefined();
    expect(provider.shutdown).toHaveBeenCalledOnce();
  });

  it('swallows a shutdown rejection so the caller can still exit', async () => {
    const provider = {
      forceFlush: vi.fn(async () => {}),
      shutdown: vi.fn(() => Promise.reject(new Error('shutdown failed'))),
    };

    await expect(gracefulShutdown(provider, 10_000)).resolves.toBeUndefined();
  });
});

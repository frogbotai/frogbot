import { afterEach, describe, expect, it, vi } from 'vitest';

const initState = vi.hoisted(() => ({
  calls: 0,
  outcomes: [] as Array<() => Promise<unknown>>,
}));

vi.mock('./frogbot.js', () => ({
  Frogbot: class {
    init = vi.fn(() => {
      initState.calls++;
      return (initState.outcomes.shift() ?? (() => Promise.resolve(this)))();
    });
  },
}));

const { getFrogbot, getCachedFrogbot, resetFrogbotCache } = await import('./getFrogbot.js');

const options = { config: Promise.resolve({}) } as never;

afterEach(() => {
  resetFrogbotCache();
  initState.calls = 0;
  initState.outcomes = [];
});

describe('getFrogbot', () => {
  it('returns the same instance across calls', async () => {
    const first = await getFrogbot(options);
    const second = await getFrogbot(options);
    expect(second).toBe(first);
  });

  it('deduplicates concurrent initialization into one instance', async () => {
    const [first, second] = await Promise.all([getFrogbot(options), getFrogbot(options)]);
    expect(second).toBe(first);
  });

  it('deduplicates concurrent callers when initialization fails', async () => {
    const error = new Error('transient init failure');
    initState.outcomes.push(() => Promise.reject(error));

    const first = getFrogbot(options);
    const second = getFrogbot(options);

    const results = await Promise.allSettled([first, second]);
    expect(results).toEqual([
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
    ]);
    expect(initState.calls).toBe(1);
  });

  it('retries after rejection and caches the successful retry', async () => {
    const recovered = {};
    initState.outcomes.push(
      () => Promise.reject(new Error('transient init failure')),
      () => Promise.resolve(recovered),
    );

    await expect(getFrogbot(options)).rejects.toThrow('transient init failure');
    await expect(getFrogbot(options)).resolves.toBe(recovered);
    await expect(getFrogbot(options)).resolves.toBe(recovered);
    expect(initState.calls).toBe(2);
  });

  it('keeps a newer pending retry cached after an older rejection', async () => {
    let resolveRetry!: (value: unknown) => void;
    const retry = new Promise<unknown>((resolve) => {
      resolveRetry = resolve;
    });
    const recovered = {};
    initState.outcomes.push(
      () => Promise.reject(new Error('transient init failure')),
      () => retry,
    );

    await expect(getFrogbot(options)).rejects.toThrow('transient init failure');
    const second = getFrogbot(options);
    const concurrent = getFrogbot(options);
    if (initState.calls === 2) resolveRetry(recovered);
    const results = await Promise.allSettled([second, concurrent]);
    expect(results).toEqual([
      { status: 'fulfilled', value: recovered },
      { status: 'fulfilled', value: recovered },
    ]);
    expect(initState.calls).toBe(2);
  });

  it('shares the cached instance across module graphs via globalThis', async () => {
    const instance = await getFrogbot(options);

    vi.resetModules();
    const fresh = await import('./getFrogbot.js');

    expect(fresh.getFrogbot).not.toBe(getFrogbot);
    expect(fresh.getCachedFrogbot()).toBe(instance);
    expect(await fresh.getFrogbot(options)).toBe(instance);
  });

  it('getCachedFrogbot returns null before initialization', () => {
    expect(getCachedFrogbot()).toBeNull();
  });

  it('getCachedFrogbot returns the instance after initialization', async () => {
    const instance = await getFrogbot(options);
    expect(getCachedFrogbot()).toBe(instance);
  });

  it('resetFrogbotCache clears the cached instance', async () => {
    const first = await getFrogbot(options);
    resetFrogbotCache();
    expect(getCachedFrogbot()).toBeNull();
    const second = await getFrogbot(options);
    expect(second).not.toBe(first);
  });

  it('accepts a lifecycle-created instance without replacing it', async () => {
    const lifecycleInstance = {};
    const module = await import('./getFrogbot.js');
    const seed = (module as unknown as { seedFrogbotCache: (instance: unknown) => void }).seedFrogbotCache;

    seed(lifecycleInstance);

    expect(getCachedFrogbot()).toBe(lifecycleInstance);
    expect(await getFrogbot(options)).toBe(lifecycleInstance);
  });
});

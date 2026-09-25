import { afterEach, describe, expect, it, vi } from 'vitest';

const initState = vi.hoisted(() => ({
  calls: 0,
  outcomes: [] as Array<() => Promise<unknown>>,
}));

vi.mock('../../../packages/frogbot/src/frogbot.js', () => ({
  FrogBot: class {
    init = vi.fn(() => {
      initState.calls++;
      return (initState.outcomes.shift() ?? (() => Promise.resolve(this)))();
    });
  },
}));

const { createDefaultRequest, getFrogBot, getCachedFrogBot, resetFrogBotCache, seedFrogBotCache } =
  await import('../../../packages/frogbot/src/getFrogBot.js');

const options = { config: Promise.resolve({}) } as never;

afterEach(() => {
  resetFrogBotCache();
  initState.calls = 0;
  initState.outcomes = [];
});

describe('getFrogBot', () => {
  it('returns the same instance across calls', async () => {
    const first = await getFrogBot(options);
    const second = await getFrogBot(options);
    expect(second).toBe(first);
  });

  it('refreshes the singleton when the config reference changes', async () => {
    const first = await getFrogBot(options);
    const second = await getFrogBot({ config: Promise.resolve({}) } as never);

    expect(second).not.toBe(first);
    expect(initState.calls).toBe(2);
    expect(getCachedFrogBot()).toBe(second);
  });

  it('deduplicates concurrent initialization into one instance', async () => {
    const [first, second] = await Promise.all([getFrogBot(options), getFrogBot(options)]);
    expect(second).toBe(first);
  });

  it('deduplicates concurrent callers when initialization fails', async () => {
    const error = new Error('transient init failure');
    initState.outcomes.push(() => Promise.reject(error));

    const first = getFrogBot(options);
    const second = getFrogBot(options);

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

    await expect(getFrogBot(options)).rejects.toThrow('transient init failure');
    await expect(getFrogBot(options)).resolves.toBe(recovered);
    await expect(getFrogBot(options)).resolves.toBe(recovered);
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

    await expect(getFrogBot(options)).rejects.toThrow('transient init failure');
    const second = getFrogBot(options);
    const concurrent = getFrogBot(options);
    if (initState.calls === 2) resolveRetry(recovered);
    const results = await Promise.allSettled([second, concurrent]);
    expect(results).toEqual([
      { status: 'fulfilled', value: recovered },
      { status: 'fulfilled', value: recovered },
    ]);
    expect(initState.calls).toBe(2);
  });

  it('shares the cached instance across module graphs via globalThis', async () => {
    const instance = await getFrogBot(options);

    vi.resetModules();
    const fresh = await import('../../../packages/frogbot/src/getFrogBot.js');

    expect(fresh.getFrogBot).not.toBe(getFrogBot);
    expect(fresh.getCachedFrogBot()).toBe(instance);
    expect(await fresh.getFrogBot(options)).toBe(instance);
  });

  it('getCachedFrogBot returns null before initialization', () => {
    expect(getCachedFrogBot()).toBeNull();
  });

  it('creates requests only from an initialized default runtime', async () => {
    await expect(createDefaultRequest()).rejects.toThrow('finish initialization');
    const req = {};
    seedFrogBotCache({ createRequest: vi.fn().mockResolvedValue(req) } as never);
    await expect(createDefaultRequest()).resolves.toBe(req);
  });

  it('getCachedFrogBot returns the instance after initialization', async () => {
    const instance = await getFrogBot(options);
    expect(getCachedFrogBot()).toBe(instance);
  });

  it('resetFrogBotCache clears the cached instance', async () => {
    const first = await getFrogBot(options);
    resetFrogBotCache();
    expect(getCachedFrogBot()).toBeNull();
    const second = await getFrogBot(options);
    expect(second).not.toBe(first);
  });

  it('accepts a lifecycle-created instance without replacing it', async () => {
    const lifecycleInstance = {};
    const module = await import('../../../packages/frogbot/src/getFrogBot.js');
    const seed = (module as unknown as { seedFrogBotCache: (instance: unknown) => void })
      .seedFrogBotCache;

    seed(lifecycleInstance);

    expect(getCachedFrogBot()).toBe(lifecycleInstance);
    expect(await getFrogBot(options)).toBe(lifecycleInstance);
  });
});

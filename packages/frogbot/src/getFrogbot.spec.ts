import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./frogbot.js', () => ({
  Frogbot: class {
    init = vi.fn(() => Promise.resolve(this));
  },
}));

const { getFrogbot, getCachedFrogbot, resetFrogbotCache } = await import('./getFrogbot.js');

const options = { config: Promise.resolve({}) } as never;

afterEach(() => {
  resetFrogbotCache();
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

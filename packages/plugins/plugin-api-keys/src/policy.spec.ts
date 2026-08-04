import { describe, expect, it } from 'vitest';

import { SerialQueue, SlidingWindowRateLimiter, resolvePolicy } from './policy.js';

describe('SerialQueue', () => {
  it('serializes a subject and releases it after settlement', async () => {
    const queue = new SerialQueue();
    const order: string[] = [];
    let release!: () => void;
    const first = queue.run('key:1', async () => {
      order.push('first:start');
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      order.push('first:end');
    });
    const second = queue.run('key:1', async () => {
      order.push('second');
    });

    await Promise.resolve();
    expect(order).toEqual(['first:start']);
    expect(queue.pending).toBe(1);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'first:end', 'second']);
    expect(queue.pending).toBe(0);
  });
});

describe('resolvePolicy', () => {
  it('resolves key, user, defaults, and unlimited in order', () => {
    const defaults = { monthlyBudgetUSD: 50, rpm: 10, tpm: 1000, models: ['openai/gpt-4o-mini'] };
    expect(resolvePolicy({ defaults, key: { monthlyBudget: { mode: 'custom', value: 5 } }, user: {} }).monthlyBudgetUSD).toBe(5);
    expect(resolvePolicy({ defaults, key: {}, user: { rpm: { mode: 'custom', value: 3 } } }).rpm).toBe(3);
    expect(resolvePolicy({ defaults, key: {}, user: {} })).toMatchObject(defaults);
    expect(resolvePolicy({ defaults, key: { models: { mode: 'unlimited' } }, user: {} }).models).toBeUndefined();
  });
});

describe('SlidingWindowRateLimiter', () => {
  it('enforces request and settled token windows', () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter(() => now);
    expect(limiter.admit('key:1', { rpm: 2, tpm: 10 })).toBeUndefined();
    limiter.settle('key:1', 10);
    expect(limiter.admit('key:1', { rpm: 2, tpm: 10 })).toEqual(expect.objectContaining({ kind: 'tpm' }));
    now = 60_001;
    expect(limiter.admit('key:1', { rpm: 2, tpm: 10 })).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';

import { SerialQueue } from './policy.js';

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
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'first:end', 'second']);
  });
});

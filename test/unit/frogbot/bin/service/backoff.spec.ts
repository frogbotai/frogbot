import { describe, expect, it } from 'vitest';

import { createBackoff } from '../../../../../packages/frogbot/src/bin/service/backoff.js';

describe('crash backoff', () => {
  it('waits 1 s, doubling to 30 s, and starts over after 60 s up', () => {
    let now = 0;
    const backoff = createBackoff({ now: () => now });

    expect([1, 2, 3, 4, 5, 6, 7].map(() => backoff.next(now))).toEqual([
      1000, 2000, 4000, 8000, 16_000, 30_000, 30_000,
    ]);

    now = 60_000;

    expect(backoff.next(0)).toBe(1000);
    expect(backoff.next(59_999)).toBe(2000);
  });
});

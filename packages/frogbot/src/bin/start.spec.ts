import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runNext: vi.fn(),
}));

vi.mock('./runNext.js', () => ({ runNext: mocks.runNext }));

import { start } from './start.js';

describe('frogbot start command', () => {
  it('delegates to `next start` with passthrough args', () => {
    start(['-p', '8080']);
    expect(mocks.runNext).toHaveBeenCalledWith('start', ['-p', '8080']);
  });

  it('defaults to no extra args', () => {
    start();
    expect(mocks.runNext).toHaveBeenCalledWith('start', []);
  });
});

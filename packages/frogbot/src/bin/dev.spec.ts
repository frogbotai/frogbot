import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runNext: vi.fn(),
}));

vi.mock('./runNext.js', () => ({ runNext: mocks.runNext }));

import { dev } from './dev.js';

describe('frogbot dev command', () => {
  it('delegates to `next dev` with passthrough args', () => {
    dev(['-p', '4000']);
    expect(mocks.runNext).toHaveBeenCalledWith('dev', ['-p', '4000']);
  });

  it('defaults to no extra args', () => {
    dev();
    expect(mocks.runNext).toHaveBeenCalledWith('dev', []);
  });
});

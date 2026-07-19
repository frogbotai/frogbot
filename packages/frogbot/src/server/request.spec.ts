import { describe, expect, it, vi } from 'vitest';

import { attachFrogbot } from './request.js';

const mockFrogbot = { find: vi.fn() } as any;

vi.mock('../getFrogbot.js', () => ({
  getCachedFrogbot: vi.fn(() => mockFrogbot),
}));

describe('attachFrogbot', () => {
  it('sets req.frogbot to the cached Frogbot singleton', () => {
    const req = { payload: {} } as any;
    attachFrogbot(req);
    expect(req.frogbot).toBe(mockFrogbot);
  });

  it('is idempotent — a second call on the same request is a no-op', () => {
    const existingFrogbot = { existing: true };
    const req = { payload: {}, frogbot: existingFrogbot } as any;
    attachFrogbot(req);
    expect(req.frogbot).toBe(existingFrogbot);
  });
});

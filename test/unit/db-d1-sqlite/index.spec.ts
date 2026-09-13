import { describe, expect, it, vi } from 'vitest';

import { sqliteD1Adapter } from '../../../packages/db-d1-sqlite/src/index';

vi.mock('frogbot/jobs', () => import('../../../packages/frogbot/src/exports/jobs.js'));

describe('@frogbotai/db-d1-sqlite exports', () => {
  it('exports sqliteD1Adapter as a function', () => {
    expect(typeof sqliteD1Adapter).toBe('function');
  });
});

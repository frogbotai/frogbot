import { describe, expect, it, vi } from 'vitest';

import { sql, sqliteAdapter } from '../../../packages/db-sqlite/src/index';

vi.mock('frogbot/jobs', () => import('../../../packages/frogbot/src/exports/jobs.js'));

describe('@frogbotai/db-sqlite exports', () => {
  it('exports sqliteAdapter as a function', () => {
    expect(typeof sqliteAdapter).toBe('function');
  });

  it('exports sql for generated migrations', () => {
    expect(sql).toBeDefined();
  });
});

import { describe, expect, it, vi } from 'vitest';

import { sql, sqliteAdapter } from '../../../packages/db-sqlite/src/index';
import { sqliteSearchAdapter } from '../../../packages/frogbot/src/exports/search.js';

vi.mock('frogbot/jobs', () => import('../../../packages/frogbot/src/exports/jobs.js'));
vi.mock('frogbot/search', () => import('../../../packages/frogbot/src/exports/search.js'));

describe('@frogbotai/db-sqlite exports', () => {
  it('exports sqliteAdapter as a function', () => {
    expect(typeof sqliteAdapter).toBe('function');
  });

  it('exports sql for generated migrations', () => {
    expect(sql).toBeDefined();
  });

  it('declares the SQLite search adapter', () => {
    expect(sqliteAdapter({ client: { url: ':memory:' } }).search).toBe(sqliteSearchAdapter);
  });
});

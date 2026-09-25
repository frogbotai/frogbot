import { describe, expect, it, vi } from 'vitest';

import { postgresAdapter } from '../../../packages/db-postgres/src/index';
import { postgresSearchAdapter } from '../../../packages/frogbot/src/exports/search.js';

vi.mock('frogbot/jobs', () => import('../../../packages/frogbot/src/exports/jobs.js'));
vi.mock('frogbot/search', () => import('../../../packages/frogbot/src/exports/search.js'));

describe('@frogbotai/db-postgres exports', () => {
  it('exports postgresAdapter as a function', () => {
    expect(typeof postgresAdapter).toBe('function');
  });

  it('declares the Postgres search adapter', () => {
    expect(postgresAdapter({ pool: {} }).search).toBe(postgresSearchAdapter);
  });
});

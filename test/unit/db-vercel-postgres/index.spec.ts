import { describe, expect, it, vi } from 'vitest';

import { vercelPostgresAdapter } from '../../../packages/db-vercel-postgres/src/index';
import { postgresSearchAdapter } from '../../../packages/frogbot/src/exports/search.js';

vi.mock('frogbot/jobs', () => import('../../../packages/frogbot/src/exports/jobs.js'));
vi.mock('frogbot/search', () => import('../../../packages/frogbot/src/exports/search.js'));

describe('@frogbotai/db-vercel-postgres exports', () => {
  it('exports vercelPostgresAdapter as a function', () => {
    expect(typeof vercelPostgresAdapter).toBe('function');
  });

  it('declares the Postgres search adapter', () => {
    expect(vercelPostgresAdapter({ pool: {} }).search).toBe(postgresSearchAdapter);
  });
});

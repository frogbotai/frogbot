import { describe, expect, it, vi } from 'vitest';

import { vercelPostgresAdapter } from '../../../packages/db-vercel-postgres/src/index';

vi.mock('frogbot/jobs', () => import('../../../packages/frogbot/src/exports/jobs.js'));

describe('@frogbotai/db-vercel-postgres exports', () => {
  it('exports vercelPostgresAdapter as a function', () => {
    expect(typeof vercelPostgresAdapter).toBe('function');
  });
});

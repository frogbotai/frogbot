import { describe, expect, it, vi } from 'vitest';

import { postgresAdapter } from '../../../packages/db-postgres/src/index';

vi.mock('frogbot/jobs', () => import('../../../packages/frogbot/src/exports/jobs.js'));

describe('@frogbotai/db-postgres exports', () => {
  it('exports postgresAdapter as a function', () => {
    expect(typeof postgresAdapter).toBe('function');
  });
});

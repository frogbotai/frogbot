import { describe, expect, it, vi } from 'vitest';

import { mongooseAdapter } from '../../../../packages/db-mongodb/src/index';

vi.mock('frogbot/jobs', () => import('../../../../packages/frogbot/src/exports/jobs.js'));

describe('@frogbotai/db-mongodb exports', () => {
  it('exports mongooseAdapter as a function', () => {
    expect(typeof mongooseAdapter).toBe('function');
  });
});

import { describe, expect, it, vi } from 'vitest';

import { compatibilityOptions, mongooseAdapter } from '../../../../packages/db-mongodb/src/index';

vi.mock('frogbot/jobs', () => import('../../../../packages/frogbot/src/exports/jobs.js'));

describe('@frogbotai/db-mongodb exports', () => {
  it('exports mongooseAdapter as a function', () => {
    expect(typeof mongooseAdapter).toBe('function');
  });

  it('exports the recommended settings for other MongoDB implementations', () => {
    expect(compatibilityOptions.firestore).toMatchObject({ ensureIndexes: false });
  });
});

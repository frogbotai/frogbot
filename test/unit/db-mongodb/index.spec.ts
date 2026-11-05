import { describe, expect, it, vi } from 'vitest';

import { mongooseAggregateAdapter } from '../../../packages/db-mongodb/src/aggregate/index.js';
import { compatibilityOptions, mongooseAdapter } from '../../../packages/db-mongodb/src/index';

vi.mock('frogbot/jobs', () => import('../../../packages/frogbot/src/exports/jobs.js'));

describe('@frogbotai/db-mongodb exports', () => {
  it('exports mongooseAdapter as a function', () => {
    expect(typeof mongooseAdapter).toBe('function');
  });

  it('declares the MongoDB aggregate adapter', () => {
    expect(mongooseAdapter({ url: 'mongodb://localhost/test' }).aggregate).toBe(
      mongooseAggregateAdapter,
    );
  });

  it('exports the recommended settings for other MongoDB implementations', () => {
    expect(compatibilityOptions.firestore).toMatchObject({ ensureIndexes: false });
  });
});

describe('mongooseAdapter connect', () => {
  it('connects with url: false, leaving no connection to wait on', async () => {
    const database = mongooseAdapter({ url: false }).init({ payload: {} as never });

    await expect(database.connect?.()).resolves.toBeUndefined();
    expect(database.connection).toBeUndefined();
  });
});

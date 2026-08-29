import { describe, expect, it } from 'vitest';

import { mongooseAdapter } from '../../../packages/db-mongodb/src/index';

describe('@frogbotai/db-mongodb exports', () => {
  it('exports mongooseAdapter as a function', () => {
    expect(typeof mongooseAdapter).toBe('function');
  });
});

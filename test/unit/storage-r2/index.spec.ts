import { describe, expect, it } from 'vitest';

import { r2Storage } from '../../../packages/storage-r2/src/index';

describe('@frogbotai/storage-r2 exports', () => {
  it('exports r2Storage as a function', () => {
    expect(typeof r2Storage).toBe('function');
  });
});

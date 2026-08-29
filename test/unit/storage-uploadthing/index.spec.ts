import { describe, expect, it } from 'vitest';

import { uploadthingStorage } from '../../../packages/storage-uploadthing/src/index';

describe('@frogbotai/storage-uploadthing exports', () => {
  it('exports uploadthingStorage as a function', () => {
    expect(typeof uploadthingStorage).toBe('function');
  });
});

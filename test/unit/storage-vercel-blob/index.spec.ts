import { describe, expect, it } from 'vitest';

import { vercelBlobStorage } from '../../../packages/storage-vercel-blob/src/index';

describe('@frogbotai/storage-vercel-blob exports', () => {
  it('exports vercelBlobStorage as a function', () => {
    expect(typeof vercelBlobStorage).toBe('function');
  });
});

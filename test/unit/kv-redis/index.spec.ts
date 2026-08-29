import { describe, expect, it } from 'vitest';

import { redisKVAdapter } from '../../../packages/kv-redis/src/index';

describe('@frogbotai/kv-redis exports', () => {
  it('exports redisKVAdapter as a function', () => {
    expect(typeof redisKVAdapter).toBe('function');
  });
});

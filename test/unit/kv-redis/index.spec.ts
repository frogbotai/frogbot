import { RedisKVAdapter as PayloadRedisKVAdapter } from '@payloadcms/kv-redis';
import { kvAtomic } from 'frogbot/kv';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RedisKVAdapter, redisKVAdapter } from '../../../packages/kv-redis/src/index.js';

const { client, construct, plainSet } = vi.hoisted(() => ({
  client: { eval: vi.fn(), set: vi.fn() },
  construct: vi.fn(),
  plainSet: vi.fn(),
}));

vi.mock('frogbot/kv', async () => ({
  ...(await import('../../../packages/frogbot/src/kv/types.js')),
  ...(await import('../../../packages/frogbot/src/kv/validateTTL.js')),
}));

vi.mock('@payloadcms/kv-redis', () => ({
  RedisKVAdapter: class {
    redisClient = client;

    constructor(
      readonly keyPrefix: string,
      redisURL: string,
    ) {
      construct(keyPrefix, redisURL);
    }

    set(...args: unknown[]) {
      return plainSet(...args);
    }

    clear() {}
    delete() {}
    get() {}
    has() {}
    keys() {}
  },
}));

describe('@frogbotai/kv-redis', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    client.eval.mockResolvedValue(1);
    client.set.mockResolvedValue('OK');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('extends the upstream class using its single client and constructor signature', () => {
    const adapter = new RedisKVAdapter('custom:', 'redis://example:6379');

    expect(adapter).toBeInstanceOf(PayloadRedisKVAdapter);
    expect(adapter[kvAtomic]).toBe(true);
    expect(adapter.redisClient).toBe(client);
    expect(adapter.keyPrefix).toBe('custom:');
    expect(construct).toHaveBeenCalledExactlyOnceWith('custom:', 'redis://example:6379');
    for (const method of ['clear', 'delete', 'get', 'has', 'keys'] as const) {
      expect(RedisKVAdapter.prototype[method]).toBe(PayloadRedisKVAdapter.prototype[method]);
    }
  });

  it('preserves lazy factory initialization and defaults from REDIS_URL', () => {
    vi.stubEnv('REDIS_URL', 'redis://environment:6379');
    const factory = redisKVAdapter();
    expect(construct).not.toHaveBeenCalled();
    expect(factory.init({ payload: {} as never })).toBeInstanceOf(RedisKVAdapter);
    expect(construct).toHaveBeenCalledExactlyOnceWith('payload-kv:', 'redis://environment:6379');
  });

  it('preserves explicit options including an empty prefix', () => {
    vi.stubEnv('REDIS_URL', 'redis://environment:6379');
    redisKVAdapter({ keyPrefix: '', redisURL: 'redis://explicit:6379' }).init();
    expect(construct).toHaveBeenCalledExactlyOnceWith('', 'redis://explicit:6379');
  });

  it('preserves the missing URL error', () => {
    vi.stubEnv('REDIS_URL', undefined);
    expect(() => redisKVAdapter()).toThrow('redisURL or REDIS_URL env variable is required');
  });

  it('does not replace the JSON data format for conditional writes', async () => {
    const adapter = new RedisKVAdapter('custom:', 'redis://example:6379');
    await expect(adapter.setIfAbsent('key', { nested: ['value', 42] })).resolves.toBe(true);
    expect(client.set).toHaveBeenCalledExactlyOnceWith(
      'custom:key',
      '{"nested":["value",42]}',
      'NX',
    );
    client.set.mockResolvedValueOnce(null);
    await expect(adapter.setIfAbsent('key', 'replacement')).resolves.toBe(false);
  });

  it('delegates ordinary writes and adds backend-timed expiry only when requested', async () => {
    const adapter = new RedisKVAdapter('custom:', 'redis://example:6379');
    await adapter.set('key', { value: 42 });
    expect(plainSet).toHaveBeenCalledExactlyOnceWith('key', { value: 42 });
    expect(client.eval).not.toHaveBeenCalled();

    await expect(adapter.set('key', 'value', { ttl: 300 })).resolves.toBeUndefined();
    expect(client.eval).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("redis.call('TIME')"),
      1,
      'custom:key',
      '"value"',
      300,
    );
    expect(plainSet).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid ttl %s before issuing commands',
    async (ttl) => {
      const adapter = new RedisKVAdapter('custom:', 'redis://example:6379');
      await expect(adapter.set('key', 'value', { ttl })).rejects.toBeInstanceOf(RangeError);
      await expect(adapter.setIfAbsent('key', 'value', { ttl })).rejects.toBeInstanceOf(RangeError);
      await expect(adapter.extendLock({ key: 'key', token: 'owner' }, ttl)).rejects.toBeInstanceOf(
        RangeError,
      );
      expect(client.eval).not.toHaveBeenCalled();
      expect(client.set).not.toHaveBeenCalled();
    },
  );

  it('uses backend time and JSON-encoded ownership in renewal', async () => {
    const adapter = new RedisKVAdapter('custom:', 'redis://example:6379');
    await expect(adapter.extendLock({ key: 'key', token: 'owner' }, 300)).resolves.toBe(true);
    expect(client.eval).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("redis.call('TIME')"),
      1,
      'custom:key',
      '"owner"',
      300,
    );
  });

  it('rejects a backend-reported expiration overflow', async () => {
    const adapter = new RedisKVAdapter('custom:', 'redis://example:6379');
    client.eval.mockResolvedValue(-1);
    await expect(
      adapter.set('key', 'value', { ttl: Number.MAX_SAFE_INTEGER }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      adapter.setIfAbsent('key', 'value', { ttl: Number.MAX_SAFE_INTEGER }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      adapter.extendLock({ key: 'key', token: 'owner' }, Number.MAX_SAFE_INTEGER),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it('checks expiration and ownership in the same release command', async () => {
    const adapter = new RedisKVAdapter('custom:', 'redis://example:6379');
    await expect(adapter.releaseLock({ key: 'key', token: 'owner' })).resolves.toBe(true);
    expect(client.eval).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("redis.call('PTTL', KEYS[1]) <= 0"),
      1,
      'custom:key',
      '"owner"',
    );
    client.eval.mockResolvedValue(0);
    await expect(adapter.releaseLock({ key: 'key', token: 'owner' })).resolves.toBe(false);
    await expect(adapter.extendLock({ key: 'key', token: 'owner' }, 300)).resolves.toBe(false);
  });

  it('propagates command failures without converting them to contention', async () => {
    const adapter = new RedisKVAdapter('custom:', 'redis://example:6379');
    const error = new Error('Redis unavailable');
    client.eval.mockRejectedValue(error);
    client.set.mockRejectedValue(error);

    await expect(adapter.set('key', 'value', { ttl: 300 })).rejects.toBe(error);
    await expect(adapter.setIfAbsent('key', 'value')).rejects.toBe(error);
    await expect(adapter.setIfAbsent('key', 'value', { ttl: 300 })).rejects.toBe(error);
    await expect(adapter.extendLock({ key: 'key', token: 'owner' }, 300)).rejects.toBe(error);
    await expect(adapter.releaseLock({ key: 'key', token: 'owner' })).rejects.toBe(error);
  });
});

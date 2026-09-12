import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { KVLeaseLostError } from '../../../packages/frogbot/src/kv/errors.js';
import { runKVLock } from '../../../packages/frogbot/src/kv/lock.js';
import type { KVLock } from '../../../packages/frogbot/src/kv/types.js';
import { RedisKVAdapter, redisKVAdapter } from '../../../packages/kv-redis/src/index.js';

vi.mock('frogbot/kv', async () => ({
  ...(await import('../../../packages/frogbot/src/kv/types.js')),
  ...(await import('../../../packages/frogbot/src/kv/validateTTL.js')),
}));

describe.skipIf(!process.env.REDIS_TEST_URL)('Redis atomic contract', () => {
  const keyPrefix = `frogbot-kv-test:${randomUUID()}:`;
  let owner: RedisKVAdapter;
  let contender: RedisKVAdapter;

  beforeAll(async () => {
    owner = redisKVAdapter({ keyPrefix, redisURL: process.env.REDIS_TEST_URL }).init();
    contender = new RedisKVAdapter(keyPrefix, process.env.REDIS_TEST_URL!);
    await Promise.all([owner.redisClient.ping(), contender.redisClient.ping()]);
  });

  beforeEach(async () => {
    await owner.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      await owner?.clear();
    } finally {
      owner?.redisClient.disconnect();
      contender?.redisClient.disconnect();
    }
  });

  it('preserves inherited CRUD, prefix isolation, and raw JSON serialization', async () => {
    const outsideKey = `frogbot-kv-outside:${randomUUID()}`;
    await owner.redisClient.set(outsideKey, 'untouched');
    try {
      await owner.set('nested', { nested: ['value', 42, true, null] });
      await owner.set('string', 'value');
      expect(await owner.redisClient.get(`${keyPrefix}string`)).toBe('"value"');
      expect(await contender.get('nested')).toEqual({ nested: ['value', 42, true, null] });
      expect(await owner.has('nested')).toBe(true);
      expect((await owner.keys()).sort()).toEqual(['nested', 'string']);
      await owner.delete('nested');
      expect(await contender.get('nested')).toBeNull();
      await owner.clear();
      expect(await owner.keys()).toEqual([]);
      expect(await owner.redisClient.get(outsideKey)).toBe('untouched');
    } finally {
      await owner.redisClient.del(outsideKey);
    }
  });

  it('expires values and hides them from inherited reads', async () => {
    await owner.set('temporary', { value: 42 }, { ttl: 40 });
    expect(await contender.get('temporary')).toEqual({ value: 42 });
    await setTimeout(80);
    expect(await contender.get('temporary')).toBeNull();
    expect(await contender.has('temporary')).toBe(false);
    expect(await contender.keys()).toEqual([]);
  });

  it('replaces expiration and clears it on ordinary overwrite', async () => {
    await owner.set('key', 'first', { ttl: 10_000 });
    await owner.set('key', 'second', { ttl: 20_000 });
    expect(await owner.redisClient.pttl(`${keyPrefix}key`)).toBeGreaterThan(10_000);
    await owner.set('key', 'permanent');
    expect(await contender.get('key')).toBe('permanent');
    expect(await owner.redisClient.pttl(`${keyPrefix}key`)).toBe(-1);
  });

  it.each([undefined, 10_000])('allows one independent-client winner with ttl %s', async (ttl) => {
    const results = await Promise.all(
      Array.from({ length: 32 }, (_, index) =>
        (index % 2 === 0 ? owner : contender).setIfAbsent('race', `token-${index}`, { ttl }),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await owner.get('race')).toBe(`token-${results.indexOf(true)}`);
    if (ttl === undefined) expect(await owner.redisClient.pttl(`${keyPrefix}race`)).toBe(-1);
    else expect(await owner.redisClient.pttl(`${keyPrefix}race`)).toBeGreaterThan(0);
  });

  it('does not mutate an occupied key or its expiry when a claim fails', async () => {
    await owner.set('key', 'owner', { ttl: 10_000 });
    expect(await contender.setIfAbsent('key', 'other', { ttl: 100_000 })).toBe(false);
    expect(await contender.setIfAbsent('key', 'other')).toBe(false);
    expect(await owner.get('key')).toBe('owner');
    expect(await owner.redisClient.pttl(`${keyPrefix}key`)).toBeLessThanOrEqual(10_000);
    expect(await owner.redisClient.pttl(`${keyPrefix}key`)).toBeGreaterThan(0);
  });

  it('reclaims expired keys without cleanup and rejects an expired owner', async () => {
    const lock = { key: 'key', token: 'old-owner' };
    expect(await owner.setIfAbsent(lock.key, lock.token, { ttl: 40 })).toBe(true);
    await setTimeout(80);
    expect(await owner.extendLock(lock, 10_000)).toBe(false);
    expect(await owner.releaseLock(lock)).toBe(false);
    expect(await contender.setIfAbsent('key', 'new-owner', { ttl: 10_000 })).toBe(true);
    expect(await owner.extendLock(lock, 10_000)).toBe(false);
    expect(await owner.releaseLock(lock)).toBe(false);
    expect(await contender.get('key')).toBe('new-owner');
  });

  it('renews and releases only the current JSON-encoded token', async () => {
    const lock = { key: 'key', token: 'owner-"\\-🐸' };
    await owner.setIfAbsent(lock.key, lock.token, { ttl: 10_000 });
    expect(await owner.redisClient.get(`${keyPrefix}key`)).toBe(JSON.stringify(lock.token));
    expect(await contender.extendLock({ key: 'key', token: 'wrong' }, 30_000)).toBe(false);
    expect(await contender.releaseLock({ key: 'key', token: 'wrong' })).toBe(false);
    expect(await owner.extendLock(lock, 30_000)).toBe(true);
    expect(await owner.redisClient.pttl(`${keyPrefix}key`)).toBeGreaterThan(20_000);
    expect(await owner.releaseLock(lock)).toBe(true);
    expect(await owner.releaseLock(lock)).toBe(false);
    expect(await owner.extendLock(lock, 30_000)).toBe(false);
  });

  it('never treats a matching permanent value as an owned lease', async () => {
    const lock = { key: 'key', token: 'owner' };
    await owner.setIfAbsent(lock.key, lock.token, { ttl: 10_000 });
    await contender.set(lock.key, lock.token);
    expect(await owner.extendLock(lock, 30_000)).toBe(false);
    expect(await owner.releaseLock(lock)).toBe(false);
    expect(await owner.get(lock.key)).toBe(lock.token);
    expect(await owner.redisClient.pttl(`${keyPrefix}key`)).toBe(-1);
  });

  it('serializes concurrent renewal and release without resurrecting the lease', async () => {
    const lock = { key: 'key', token: 'owner' };
    await owner.setIfAbsent(lock.key, lock.token, { ttl: 10_000 });
    const [, released] = await Promise.all([
      owner.extendLock(lock, 30_000),
      contender.releaseLock(lock),
    ]);
    expect(released).toBe(true);
    expect(await owner.has(lock.key)).toBe(false);
    expect(await owner.extendLock(lock, 30_000)).toBe(false);
  });

  it('uses Redis TIME despite a skewed worker clock and enforces Date-range overflow', async () => {
    const [seconds, microseconds] = await owner.redisClient.time();
    const now = Number(seconds) * 1000 + Math.floor(Number(microseconds) / 1000);
    const validTTL = 8_640_000_000_000_000 - now - 60_000;
    const overflowTTL = 8_640_000_000_000_000 - now + 60_000;
    vi.spyOn(Date, 'now').mockReturnValue(Number.MAX_SAFE_INTEGER);

    await owner.set('near-limit', 'value', { ttl: validTTL });
    const expiresAt = Number(await owner.redisClient.call('PEXPIRETIME', `${keyPrefix}near-limit`));
    expect(expiresAt).toBeGreaterThan(8_640_000_000_000_000 - 60_001);
    expect(expiresAt).toBeLessThanOrEqual(8_640_000_000_000_000);
    await owner.setIfAbsent('claim', 'owner', { ttl: 10_000 });
    expect(await owner.extendLock({ key: 'claim', token: 'owner' }, 20_000)).toBe(true);

    vi.mocked(Date.now).mockReturnValue(0);
    await expect(owner.set('near-limit', 'wrong', { ttl: overflowTTL })).rejects.toBeInstanceOf(
      RangeError,
    );
    await expect(owner.setIfAbsent('absent', 'wrong', { ttl: overflowTTL })).rejects.toBeInstanceOf(
      RangeError,
    );
    await expect(
      owner.extendLock({ key: 'claim', token: 'owner' }, overflowTTL),
    ).rejects.toBeInstanceOf(RangeError);
    expect(await owner.get('near-limit')).toBe('value');
    expect(await owner.has('absent')).toBe(false);
    expect(await owner.redisClient.pttl(`${keyPrefix}claim`)).toBeLessThanOrEqual(20_000);
  });

  it('rejects safe-integer overflow without changing an existing value', async () => {
    await owner.set('key', 'original');
    await expect(
      owner.set('key', 'wrong', { ttl: Number.MAX_SAFE_INTEGER }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(await owner.get('key')).toBe('original');
    expect(await owner.redisClient.pttl(`${keyPrefix}key`)).toBe(-1);
  });

  it('leaves a successor intact when the scoped helper detects loss', async () => {
    let signal!: AbortSignal;
    const result = runKVLock({
      kv: {
        acquireLock: async (key, ttl): Promise<KVLock | null> => {
          const token = randomUUID();
          return (await owner.setIfAbsent(key, token, { ttl })) ? { key, token } : null;
        },
        extendLock: owner.extendLock.bind(owner),
        releaseLock: owner.releaseLock.bind(owner),
      },
      key: 'scoped',
      ttl: 300,
      fn: async (args) => {
        signal = args.signal;
        await contender.set('scoped', 'successor', { ttl: 10_000 });
        await new Promise<never>(() => {});
      },
    });

    await expect(result).rejects.toBeInstanceOf(KVLeaseLostError);
    expect(signal.aborted).toBe(true);
    expect(await contender.get('scoped')).toBe('successor');
  });
});

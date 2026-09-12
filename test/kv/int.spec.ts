import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { RedisKVAdapter, redisKVAdapter } from '@frogbotai/kv-redis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { isServiceReachable } from '../__helpers/shared/storage/storageServices';
import { kvContract } from './contract.js';
import { createKVRuntimeHarness, type KVRuntime } from './runtime.js';

const redisService = { name: 'Redis', host: 'localhost', port: 6379 };

describe('KV Adapters [Redis]', () => {
  const keyPrefix = `frogbot-kv-acceptance:${randomUUID()}:`;
  const harness = createKVRuntimeHarness({
    kv: () => redisKVAdapter({ redisURL: 'redis://localhost:6379', keyPrefix }),
  });
  let booted: KVRuntime;
  let second: KVRuntime;
  let skipSuite = false;

  beforeAll(async () => {
    const reachable = await isServiceReachable(redisService);
    if (!reachable) {
      if (process.env.CI === 'true') {
        throw new Error('Redis is required in CI but is not reachable at localhost:6379');
      }
      skipSuite = true;
      console.warn(
        '\x1b[33m⚠ Skipping KV Redis tests — Redis not reachable at localhost:6379. ' +
          'Start with: docker compose -f test/docker-compose.yml --profile redis up -d\x1b[0m',
      );
      return;
    }
    booted = await harness.boot();
    await booted.frogbot.kv.set('boot-sentinel', 'must survive second boot');
    second = await harness.boot();
    assert.equal(await second.frogbot.kv.get('boot-sentinel'), 'must survive second boot');
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async (ctx) => {
    if (skipSuite) {
      ctx.skip();
      return;
    }
    await booted.frogbot.kv.clear();
  });

  it('uses independent Redis connections sharing an isolated prefix', () => {
    const a = booted.payload.kv as RedisKVAdapter;
    const b = second.payload.kv as RedisKVAdapter;
    expect(a).toBeInstanceOf(RedisKVAdapter);
    expect(b).toBeInstanceOf(RedisKVAdapter);
    expect(a.redisClient).not.toBe(b.redisClient);
    expect(a.keyPrefix).toBe(keyPrefix);
    expect(b.keyPrefix).toBe(keyPrefix);
    expect(
      booted.payload.config.jobs.tasks?.filter(({ slug }) => slug === 'frogbot-cleanup-kv') ?? [],
    ).toEqual([]);
  });

  it('set + get stores and retrieves a value', async () => {
    await booted.frogbot.kv.set('test-key-1', { userId: 1 });
    const result = await booted.frogbot.kv.get('test-key-1');
    expect(result).toStrictEqual({ userId: 1 });
  });

  it('get returns null for missing key', async () => {
    const result = await booted.frogbot.kv.get('nonexistent-key');
    expect(result).toBeNull();
  });

  it('has returns true for existing key, false for missing', async () => {
    await booted.frogbot.kv.set('has-check', 'value');
    expect(await booted.frogbot.kv.has('has-check')).toBe(true);
    expect(await booted.frogbot.kv.has('no-such-key')).toBe(false);
  });

  it('keys returns all stored keys', async () => {
    await booted.frogbot.kv.clear();
    await booted.frogbot.kv.set('key-a', 'a');
    await booted.frogbot.kv.set('key-b', 'b');
    const keys = await booted.frogbot.kv.keys();
    expect(keys).toHaveLength(2);
    expect(keys).toContain('key-a');
    expect(keys).toContain('key-b');
  });

  it('set overwrites existing value', async () => {
    await booted.frogbot.kv.set('overwrite-key', { v: 1 });
    await booted.frogbot.kv.set('overwrite-key', { v: 2 });
    const result = await booted.frogbot.kv.get('overwrite-key');
    expect(result).toStrictEqual({ v: 2 });
  });

  it('delete removes a key', async () => {
    await booted.frogbot.kv.set('del-key', 'value');
    await booted.frogbot.kv.delete('del-key');
    expect(await booted.frogbot.kv.get('del-key')).toBeNull();
    expect(await booted.frogbot.kv.has('del-key')).toBe(false);
  });

  it('clear removes all keys', async () => {
    await booted.frogbot.kv.set('clear-1', 'a');
    await booted.frogbot.kv.set('clear-2', 'b');
    await booted.frogbot.kv.clear();
    const keys = await booted.frogbot.kv.keys();
    expect(keys).toHaveLength(0);
  });

  it('stores complex nested objects', async () => {
    const complex = { user: { name: 'test', roles: ['admin', 'editor'] }, count: 42 };
    await booted.frogbot.kv.set('complex', complex);
    expect(await booted.frogbot.kv.get('complex')).toStrictEqual(complex);
  });

  kvContract({
    clients: () => [booted.frogbot.kv, second.frogbot.kv],
    restart: async () => {
      await booted.shutdown();
      await second.shutdown();
      booted = await harness.boot();
      second = await harness.boot();
    },
  });
});

import {
  RedisKVAdapter as PayloadRedisKVAdapter,
  type RedisKVAdapterOptions,
} from '@payloadcms/kv-redis';
import type { KVAdapterResult, KVStoreValue } from 'frogbot';
import {
  kvAtomic,
  type KVAtomicAdapter,
  type KVLock,
  type KVSetOptions,
  validateKVTTL,
} from 'frogbot/kv';

export type { RedisKVAdapterOptions } from '@payloadcms/kv-redis';

const expirationScript = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local ttl = tonumber(ARGV[2])
if ttl > 8640000000000000 - now then return -1 end
local expiresAt = string.format('%.0f', now + ttl)
`;

const setScript = `${expirationScript}
redis.call('SET', KEYS[1], ARGV[1], 'PXAT', expiresAt)
return 1
`;

const setIfAbsentScript = `${expirationScript}
if redis.call('SET', KEYS[1], ARGV[1], 'PXAT', expiresAt, 'NX') then return 1 end
return 0
`;

const extendLockScript = `${expirationScript}
if redis.call('PTTL', KEYS[1]) <= 0 then return 0 end
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call('PEXPIREAT', KEYS[1], expiresAt)
`;

const releaseLockScript = `
if redis.call('PTTL', KEYS[1]) <= 0 then return 0 end
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])
`;

export class RedisKVAdapter extends PayloadRedisKVAdapter implements KVAtomicAdapter {
  readonly [kvAtomic] = true as const;

  override async set(key: string, value: KVStoreValue, options?: KVSetOptions): Promise<void> {
    if (options?.ttl === undefined) {
      return super.set(key, value);
    }
    await this.evalTTL({ script: setScript, key, value, ttl: options.ttl });
  }

  async setIfAbsent(key: string, value: KVStoreValue, options?: KVSetOptions): Promise<boolean> {
    if (options?.ttl === undefined) {
      return (
        (await this.redisClient.set(`${this.keyPrefix}${key}`, JSON.stringify(value), 'NX')) ===
        'OK'
      );
    }
    return this.evalTTL({ script: setIfAbsentScript, key, value, ttl: options.ttl });
  }

  async extendLock(lock: KVLock, ttl: number): Promise<boolean> {
    return this.evalTTL({ script: extendLockScript, key: lock.key, value: lock.token, ttl });
  }

  async releaseLock(lock: KVLock): Promise<boolean> {
    return (
      (await this.redisClient.eval(
        releaseLockScript,
        1,
        `${this.keyPrefix}${lock.key}`,
        JSON.stringify(lock.token),
      )) === 1
    );
  }

  private async evalTTL({
    script,
    key,
    value,
    ttl,
  }: {
    script: string;
    key: string;
    value: KVStoreValue;
    ttl: number;
  }): Promise<boolean> {
    validateKVTTL(ttl);
    const result = await this.redisClient.eval(
      script,
      1,
      `${this.keyPrefix}${key}`,
      JSON.stringify(value),
      ttl,
    );
    if (result === -1) {
      throw new RangeError('KV ttl expiration exceeds the supported date range');
    }
    return result === 1;
  }
}

export const redisKVAdapter = (options: RedisKVAdapterOptions = {}) => {
  const keyPrefix = options.keyPrefix ?? 'payload-kv:';
  const redisURL = options.redisURL ?? process.env.REDIS_URL;

  if (!redisURL) {
    throw new Error('redisURL or REDIS_URL env variable is required');
  }

  return {
    init: (_args?: Parameters<KVAdapterResult['init']>[0]) =>
      new RedisKVAdapter(keyPrefix, redisURL),
  };
};

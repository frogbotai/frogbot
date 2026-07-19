import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'

import { RedisKVAdapter } from '@frogbot/kv-redis'
import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot'
import { bootFrogbot } from '../__helpers/shared/bootFrogbot'
import { isServiceReachable } from '../__helpers/shared/storage/storageServices'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const redisService = { name: 'Redis', host: 'localhost', port: 6379 }

describe('KV Adapters [Redis]', () => {
  let booted: BootedFrogbot
  let skipSuite = false

  beforeAll(async () => {
    const reachable = await isServiceReachable(redisService)
    if (!reachable) {
      skipSuite = true
      console.warn(
        '\x1b[33m⚠ Skipping KV Redis tests — Redis not reachable at localhost:6379. ' +
        'Start with: docker compose -f test/docker-compose.yml --profile redis up -d\x1b[0m',
      )
      return
    }
    booted = await bootFrogbot(dirname)
  })

  afterAll(async () => {
    if (booted) {
      // Clean up Redis connection before shutdown
      const kv = booted.frogbot.kv
      if (kv instanceof RedisKVAdapter) {
        await kv.redisClient.quit()
      }
      await booted.shutdown()
    }
  })

  beforeEach((ctx) => {
    if (skipSuite) {
      ctx.skip()
      return
    }
  })

  it('set + get stores and retrieves a value', async () => {
    await booted.frogbot.kv.set('test-key-1', { userId: 1 })
    const result = await booted.frogbot.kv.get('test-key-1')
    expect(result).toStrictEqual({ userId: 1 })
  })

  it('get returns null for missing key', async () => {
    const result = await booted.frogbot.kv.get('nonexistent-key')
    expect(result).toBeNull()
  })

  it('has returns true for existing key, false for missing', async () => {
    await booted.frogbot.kv.set('has-check', 'value')
    expect(await booted.frogbot.kv.has('has-check')).toBe(true)
    expect(await booted.frogbot.kv.has('no-such-key')).toBe(false)
  })

  it('keys returns all stored keys', async () => {
    await booted.frogbot.kv.clear()
    await booted.frogbot.kv.set('key-a', 'a')
    await booted.frogbot.kv.set('key-b', 'b')
    const keys = await booted.frogbot.kv.keys()
    expect(keys).toHaveLength(2)
    expect(keys).toContain('key-a')
    expect(keys).toContain('key-b')
  })

  it('set overwrites existing value', async () => {
    await booted.frogbot.kv.set('overwrite-key', { v: 1 })
    await booted.frogbot.kv.set('overwrite-key', { v: 2 })
    const result = await booted.frogbot.kv.get('overwrite-key')
    expect(result).toStrictEqual({ v: 2 })
  })

  it('delete removes a key', async () => {
    await booted.frogbot.kv.set('del-key', 'value')
    await booted.frogbot.kv.delete('del-key')
    expect(await booted.frogbot.kv.get('del-key')).toBeNull()
    expect(await booted.frogbot.kv.has('del-key')).toBe(false)
  })

  it('clear removes all keys', async () => {
    await booted.frogbot.kv.set('clear-1', 'a')
    await booted.frogbot.kv.set('clear-2', 'b')
    await booted.frogbot.kv.clear()
    const keys = await booted.frogbot.kv.keys()
    expect(keys).toHaveLength(0)
  })

  it('stores complex nested objects', async () => {
    const complex = { user: { name: 'test', roles: ['admin', 'editor'] }, count: 42 }
    await booted.frogbot.kv.set('complex', complex)
    expect(await booted.frogbot.kv.get('complex')).toStrictEqual(complex)
  })
})

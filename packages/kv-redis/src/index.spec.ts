import { describe, expect, it } from 'vitest'
import { redisKVAdapter } from './index'

describe('@frogbot/kv-redis exports', () => {
  it('exports redisKVAdapter as a function', () => {
    expect(typeof redisKVAdapter).toBe('function')
  })
})

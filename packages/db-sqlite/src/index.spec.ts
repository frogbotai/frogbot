import { describe, expect, it } from 'vitest'
import { sqliteAdapter } from './index'

describe('@frogbot/db-sqlite exports', () => {
  it('exports sqliteAdapter as a function', () => {
    expect(typeof sqliteAdapter).toBe('function')
  })
})

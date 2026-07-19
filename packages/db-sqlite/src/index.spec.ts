import { describe, expect, it } from 'vitest'
import { sqliteAdapter } from './index'

describe('@frogbotai/db-sqlite exports', () => {
  it('exports sqliteAdapter as a function', () => {
    expect(typeof sqliteAdapter).toBe('function')
  })
})

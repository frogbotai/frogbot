import { describe, expect, it } from 'vitest'
import { sqliteD1Adapter } from './index'

describe('@frogbot/db-d1-sqlite exports', () => {
  it('exports sqliteD1Adapter as a function', () => {
    expect(typeof sqliteD1Adapter).toBe('function')
  })
})

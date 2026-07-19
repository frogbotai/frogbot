import { describe, expect, it } from 'vitest'
import { mongooseAdapter } from './index'

describe('@frogbot/db-mongodb exports', () => {
  it('exports mongooseAdapter as a function', () => {
    expect(typeof mongooseAdapter).toBe('function')
  })
})

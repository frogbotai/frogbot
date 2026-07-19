import { describe, expect, it } from 'vitest'
import { postgresAdapter } from './index'

describe('@frogbot/db-postgres exports', () => {
  it('exports postgresAdapter as a function', () => {
    expect(typeof postgresAdapter).toBe('function')
  })
})

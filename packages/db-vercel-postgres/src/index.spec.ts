import { describe, expect, it } from 'vitest'
import { vercelPostgresAdapter } from './index'

describe('@frogbot/db-vercel-postgres exports', () => {
  it('exports vercelPostgresAdapter as a function', () => {
    expect(typeof vercelPostgresAdapter).toBe('function')
  })
})

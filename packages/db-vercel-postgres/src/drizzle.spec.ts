import { describe, expect, it } from 'vitest'
import { eq, and, sql } from './drizzle'

describe('@frogbotai/db-vercel-postgres drizzle subpath', () => {
  it('exports eq as a function', () => {
    expect(typeof eq).toBe('function')
  })

  it('exports and as a function', () => {
    expect(typeof and).toBe('function')
  })

  it('exports sql as a function', () => {
    expect(typeof sql).toBe('function')
  })
})

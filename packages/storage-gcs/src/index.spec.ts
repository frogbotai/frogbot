import { describe, expect, it } from 'vitest'
import { gcsStorage } from './index'

describe('@frogbot/storage-gcs exports', () => {
  it('exports gcsStorage as a function', () => {
    expect(typeof gcsStorage).toBe('function')
  })
})

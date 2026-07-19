import { describe, expect, it } from 'vitest'
import { gcsStorage } from './index'

describe('@frogbotai/storage-gcs exports', () => {
  it('exports gcsStorage as a function', () => {
    expect(typeof gcsStorage).toBe('function')
  })
})

import { describe, expect, it } from 'vitest'
import { s3Storage } from './index'

describe('@frogbotai/storage-s3 exports', () => {
  it('exports s3Storage as a function', () => {
    expect(typeof s3Storage).toBe('function')
  })
})

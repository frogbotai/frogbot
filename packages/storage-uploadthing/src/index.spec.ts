import { describe, expect, it } from 'vitest'
import { uploadthingStorage } from './index'

describe('@frogbot/storage-uploadthing exports', () => {
  it('exports uploadthingStorage as a function', () => {
    expect(typeof uploadthingStorage).toBe('function')
  })
})

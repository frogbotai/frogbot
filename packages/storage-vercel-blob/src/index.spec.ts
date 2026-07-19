import { describe, expect, it } from 'vitest'
import { vercelBlobStorage } from './index'

describe('@frogbotai/storage-vercel-blob exports', () => {
  it('exports vercelBlobStorage as a function', () => {
    expect(typeof vercelBlobStorage).toBe('function')
  })
})

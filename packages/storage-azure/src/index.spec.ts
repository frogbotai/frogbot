import { describe, expect, it } from 'vitest'
import { azureStorage, getStorageClient } from './index'

describe('@frogbotai/storage-azure exports', () => {
  it('exports azureStorage as a function', () => {
    expect(typeof azureStorage).toBe('function')
  })

  it('exports getStorageClient as a function', () => {
    expect(typeof getStorageClient).toBe('function')
  })
})

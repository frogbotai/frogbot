import { describe, expect, it } from 'vitest'
import { resendAdapter } from './index'

describe('@frogbotai/email-resend exports', () => {
  it('exports resendAdapter as a function', () => {
    expect(typeof resendAdapter).toBe('function')
  })
})

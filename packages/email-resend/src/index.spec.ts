import { describe, expect, it } from 'vitest'
import { resendAdapter } from './index'

describe('@frogbot/email-resend exports', () => {
  it('exports resendAdapter as a function', () => {
    expect(typeof resendAdapter).toBe('function')
  })
})

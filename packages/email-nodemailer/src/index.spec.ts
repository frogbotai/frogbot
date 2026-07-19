import { describe, expect, it } from 'vitest'
import { nodemailerAdapter } from './index'

describe('@frogbot/email-nodemailer exports', () => {
  it('exports nodemailerAdapter as a function', () => {
    expect(typeof nodemailerAdapter).toBe('function')
  })
})

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll, afterEach, vi, type Mock } from 'vitest'

import { resendAdapter } from '@frogbot/email-resend'
import { nodemailerAdapter } from '@frogbot/email-nodemailer'
import type { NodemailerAdapterArgs } from '@frogbot/email-nodemailer'
import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot'
import { bootFrogbot } from '../__helpers/shared/bootFrogbot'

const dirname = path.dirname(fileURLToPath(import.meta.url))

describe('Email Adapters', () => {
  let booted: BootedFrogbot

  beforeAll(async () => {
    booted = await bootFrogbot(dirname)
  })

  afterAll(async () => {
    if (booted) await booted.shutdown()
  })

  describe('@frogbot/email-resend', () => {
    const apiKey = 'test-api-key'
    const defaultFromAddress = 'dev@frogbot.local'
    const defaultFromName = 'FrogBot'

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('sends email via Resend API (mocked fetch)', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(
        vi.fn(() =>
          Promise.resolve({ json: () => ({ id: 'test-id' }) }),
        ) as Mock,
      )

      const adapter = resendAdapter({ apiKey, defaultFromAddress, defaultFromName })
      const initialized = adapter({ payload: booted.payload })

      await initialized.sendEmail({
        from: defaultFromAddress,
        to: 'user@example.com',
        subject: 'Test Subject',
        text: 'Hello from frogbot',
      })

      expect(global.fetch).toHaveBeenCalledTimes(1)
      const [url, options] = (global.fetch as Mock).mock.calls[0]
      expect(url).toBe('https://api.resend.com/emails')
      expect(options.headers.Authorization).toBe(`Bearer ${apiKey}`)

      const body = JSON.parse(options.body)
      expect(body.to).toBe('user@example.com')
      expect(body.subject).toBe('Test Subject')
      expect(body.text).toBe('Hello from frogbot')
    })

    it('throws on API error response', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(
        vi.fn(() =>
          Promise.resolve({
            json: () => ({ name: 'validation_error', message: 'invalid', statusCode: 403 }),
          }),
        ) as Mock,
      )

      const adapter = resendAdapter({ apiKey, defaultFromAddress, defaultFromName })
      const initialized = adapter({ payload: booted.payload })

      await expect(
        initialized.sendEmail({
          from: defaultFromAddress,
          to: 'user@example.com',
          subject: 'Fail',
          text: 'body',
        }),
      ).rejects.toThrow('Error sending email')
    })

    it('handles attachments with filename and content', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(
        vi.fn(() =>
          Promise.resolve({ json: () => ({ id: 'test-id' }) }),
        ) as Mock,
      )

      const adapter = resendAdapter({ apiKey, defaultFromAddress, defaultFromName })
      const initialized = adapter({ payload: booted.payload })

      await initialized.sendEmail({
        from: defaultFromAddress,
        to: 'user@example.com',
        subject: 'With attachment',
        attachments: [{ filename: 'doc.pdf', content: 'SGVsbG8=' }],
      })

      const body = JSON.parse((global.fetch as Mock).mock.calls[0][1].body)
      expect(body.attachments).toStrictEqual([{ filename: 'doc.pdf', content: 'SGVsbG8=' }])
    })
  })

  describe('@frogbot/email-nodemailer', () => {
    it('sends email via frogbot.email.sendEmail with mocked transport', async () => {
      const sentMessages: unknown[] = []
      const mockedTransport = {
        sendMail: async (message: unknown) => {
          sentMessages.push(message)
          return message
        },
      } as NodemailerAdapterArgs['transport']

      const adapter = await nodemailerAdapter({
        defaultFromAddress: 'noreply@frogbot.local',
        defaultFromName: 'FrogBot',
        skipVerify: true,
        transport: mockedTransport,
      })

      // Inject the adapter into the payload instance (same pattern as Payload's tests)
      booted.payload.email = adapter({ payload: booted.payload })

      await booted.frogbot.email.sendEmail({
        to: 'user@example.com',
        subject: 'Nodemailer Test',
        text: 'Hello via nodemailer',
      })

      expect(sentMessages).toHaveLength(1)
      const sent = sentMessages[0] as Record<string, unknown>
      expect(sent.to).toBe('user@example.com')
      expect(sent.subject).toBe('Nodemailer Test')
      expect(sent.text).toBe('Hello via nodemailer')
    })

    it('uses defaultFromAddress when from is not specified', async () => {
      const sentMessages: unknown[] = []
      const mockedTransport = {
        sendMail: async (message: unknown) => {
          sentMessages.push(message)
          return message
        },
      } as NodemailerAdapterArgs['transport']

      const adapter = await nodemailerAdapter({
        defaultFromAddress: 'default@frogbot.local',
        defaultFromName: 'FrogBot Default',
        skipVerify: true,
        transport: mockedTransport,
      })

      booted.payload.email = adapter({ payload: booted.payload })

      await booted.frogbot.email.sendEmail({
        to: 'user@example.com',
        subject: 'Default From',
        text: 'body',
      })

      const sent = sentMessages[0] as Record<string, unknown>
      expect(sent.from).toContain('default@frogbot.local')
    })

    it('respects overrideRecipientAddress', async () => {
      const sentMessages: unknown[] = []
      const mockedTransport = {
        sendMail: async (message: unknown) => {
          sentMessages.push(message)
          return message
        },
      } as NodemailerAdapterArgs['transport']

      const adapter = await nodemailerAdapter({
        defaultFromAddress: 'noreply@frogbot.local',
        defaultFromName: 'FrogBot',
        overrideRecipientAddress: 'intercepted@frogbot.local',
        skipVerify: true,
        transport: mockedTransport,
      })

      booted.payload.email = adapter({ payload: booted.payload })

      await booted.frogbot.email.sendEmail({
        to: 'original@example.com',
        subject: 'Override Test',
        text: 'body',
      })

      const sent = sentMessages[0] as Record<string, unknown>
      expect(sent.to).toBe('intercepted@frogbot.local')
    })
  })
})

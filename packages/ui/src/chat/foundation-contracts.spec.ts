import { describe, expect, it, vi } from 'vitest'

import { prepareChatRequest } from './transport'

const stableAttachment = {
  id: 'file-123',
  filename: 'evidence.pdf',
  mediaType: 'application/pdf',
}

describe('Firmware UI foundation contracts', () => {
  it('configures the FrogBot SDK with one server connection', async () => {
    const packageName = '@frogbotai/sdk'
    const sdkModule = await import(packageName)
    const fetch = vi.fn(() => Promise.resolve(new Response('{}')))
    const sdk = sdkModule.createFrogbotSDK({
      baseURL: 'https://frogbot.example/api',
      headers: { Authorization: 'Bearer token' },
      fetch,
    })

    await sdk.request('/files/file-123')

    expect(fetch).toHaveBeenCalledWith(
      'https://frogbot.example/api/files/file-123',
      expect.objectContaining({ headers: expect.any(Headers) }),
    )
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('authorization')).toBe('Bearer token')
  })

  it('preserves stable FrogBot attachment references', async () => {
    const prepare = prepareChatRequest()
    const request = await prepare({
      api: '/api/agents/support',
      body: undefined,
      chatId: 'chat-1',
      credentials: undefined,
      headers: undefined,
      messageId: 'message-1',
      messages: [{ id: 'message-1', role: 'user', parts: [{ type: 'file-reference', ...stableAttachment } as never] }],
      requestMetadata: undefined,
      trigger: 'submit-message',
    })

    expect(request.body).toEqual({
      messages: [{ id: 'message-1', role: 'user', parts: [{ type: 'file-reference', ...stableAttachment }] }],
    })
  })

  it('rejects inline attachment data from the chat request pipeline', async () => {
    const prepare = prepareChatRequest()

    await expect(prepare({
      api: '/api/agents/support',
      body: undefined,
      chatId: 'chat-1',
      credentials: undefined,
      headers: undefined,
      messageId: 'message-1',
      messages: [{ id: 'message-1', role: 'user', parts: [{ type: 'file', filename: 'evidence.pdf', mediaType: 'application/pdf', url: 'data:application/pdf;base64,JVBERi0=' }] }],
      requestMetadata: undefined,
      trigger: 'submit-message',
    })).rejects.toThrow('stable FrogBot file reference')
  })
})

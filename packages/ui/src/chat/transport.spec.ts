import { describe, expect, it, vi } from 'vitest'

import { FrogbotChatTransport, prepareChatRequest } from './transport'

const message = { id: 'user-1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Hello' }] }

async function captureBody(threadId?: string) {
  const fetch = vi.fn(() => Promise.resolve(new Response(new ReadableStream({ start: (controller) => controller.close() }))))
  const transport = new FrogbotChatTransport({ agentSlug: 'agent', fetch, prepareSendMessagesRequest: prepareChatRequest(threadId), body: { unsupported: true } })
  await transport.sendMessages({ chatId: 'chat', messageId: message.id, messages: [message], trigger: 'submit-message' })
  return JSON.parse(fetch.mock.calls[0][1]?.body as string)
}

describe('FrogbotChatTransport', () => {
  it('serializes the strict new-thread body', async () => {
    expect(await captureBody()).toEqual({ messages: [message] })
  })

  it('serializes the strict existing-thread body', async () => {
    expect(await captureBody('thread-1')).toEqual({ messages: [message], threadId: 'thread-1' })
  })

  it('targets the agent endpoint and captures the thread id', async () => {
    const onThreadId = vi.fn()
    const fetch = vi.fn(() => Promise.resolve(new Response('data: {"type":"finish"}\n\n', {
      headers: { 'Content-Type': 'text/event-stream', 'X-Frogbot-Thread-Id': 'thread-1' },
    })))
    const transport = new FrogbotChatTransport({ agentSlug: 'support agent', fetch, onThreadId })
    await transport.sendMessages({ chatId: 'chat', messages: [], trigger: 'submit-message' }).then((stream) => stream.cancel())
    expect(fetch).toHaveBeenCalledWith('/api/agents/support%20agent', expect.objectContaining({ method: 'POST' }))
    expect(transport.threadId).toBe('thread-1')
    expect(onThreadId).toHaveBeenCalledWith('thread-1')
  })

  it('requests the event stream response by default', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('data: {"type":"finish"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } })))
    const transport = new FrogbotChatTransport({ agentSlug: 'agent', fetch })
    await transport.sendMessages({ chatId: 'chat', messages: [], trigger: 'submit-message' }).then((stream) => stream.cancel())
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('accept')).toBe('text/event-stream')
  })

  it('preserves caller header overrides', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(new ReadableStream({ start: (controller) => controller.close() }))))
    const transport = new FrogbotChatTransport({ agentSlug: 'agent', fetch, headers: { Accept: 'application/json' } })
    await transport.sendMessages({ chatId: 'chat', messages: [], trigger: 'submit-message' })
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('accept')).toBe('application/json')
  })

  it('treats a bodyless 499 as a clean empty stream', async () => {
    const transport = new FrogbotChatTransport({ agentSlug: 'agent', fetch: () => Promise.resolve(new Response(null, { status: 499 })) })
    const stream = await transport.sendMessages({ chatId: 'chat', messages: [], trigger: 'submit-message' })
    expect((await stream.getReader().read()).done).toBe(true)
  })

  it('does not reconnect', async () => {
    expect(await new FrogbotChatTransport({ agentSlug: 'agent' }).reconnectToStream({ chatId: 'chat' })).toBeNull()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { FrogbotChatTransport } from './transport'

describe('FrogbotChatTransport', () => {
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

  it('treats a bodyless 499 as a clean empty stream', async () => {
    const transport = new FrogbotChatTransport({ agentSlug: 'agent', fetch: () => Promise.resolve(new Response(null, { status: 499 })) })
    const stream = await transport.sendMessages({ chatId: 'chat', messages: [], trigger: 'submit-message' })
    expect((await stream.getReader().read()).done).toBe(true)
  })

  it('does not reconnect', async () => {
    expect(await new FrogbotChatTransport({ agentSlug: 'agent' }).reconnectToStream({ chatId: 'chat' })).toBeNull()
  })
})

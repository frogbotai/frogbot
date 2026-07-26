import type { UIMessage } from 'ai'
import { useChat } from '@ai-sdk/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MessageList } from './message-list'

const messages: UIMessage[] = [
  { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Consumer message' }] },
  { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'Composed response' }] },
]

vi.mock('@ai-sdk/react', () => ({ useChat: vi.fn(() => ({ messages })) }))

function ConsumerShell() {
  const chat = useChat()
  return <MessageList messages={chat.messages} />
}

describe('chat composability', () => {
  it('renders from a consumer useChat call without ChatProvider', () => {
    render(<ConsumerShell />)
    expect(screen.getByText('Consumer message')).toBeTruthy()
    expect(screen.getByText('Composed response')).toBeTruthy()
  })
})

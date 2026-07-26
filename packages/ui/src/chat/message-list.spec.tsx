import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MessageList } from './message-list'

describe('MessageList', () => {
  it('renders messages and exposes scroll recovery when detached', () => {
    const { container } = render(<MessageList messages={[{ id: '1', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] }]} />)
    const scroller = container.querySelector('.overflow-y-auto') as HTMLDivElement
    Object.defineProperties(scroller, { scrollHeight: { value: 1000 }, clientHeight: { value: 200 }, scrollTop: { value: 0, writable: true }, scrollTo: { value: vi.fn() } })
    fireEvent.scroll(scroller)
    expect(screen.getByText('Hello')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Jump to latest' }))
    expect(scroller.scrollTo).toHaveBeenCalled()
  })

  it('supports consumer-owned message rendering', () => {
    render(<MessageList messages={[{ id: '1', role: 'user', parts: [] }]} renderMessage={(message) => <div key={message.id}>Own state</div>} />)
    expect(screen.getByText('Own state')).toBeTruthy()
  })
})

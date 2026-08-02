import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { validateChatMessages } from '../../../frogbot/src/chat/validateMessages'
import { MessagePart } from './message-part'

async function loadFlagParts() {
  return import('./flag-parts')
}

describe('flag parts', () => {
  it('renders pasted text instead of the JSON fallback', async () => {
    const { renderFlagPart } = await loadFlagParts()
    const { container } = render(<MessagePart part={{ type: 'data-paste', data: { text: 'Pasted content' } }} renderData={renderFlagPart} />)
    expect(screen.getByText('Pasted content')).toBeTruthy()
    expect(screen.getByText('PASTED')).toBeTruthy()
    expect(container.querySelector('pre')).toBeNull()
  })

  it('renders paste, page context, and prompt data distinctly', async () => {
    const { renderFlagPart } = await loadFlagParts()
    const { rerender } = render(<MessagePart part={{ type: 'data-paste', data: { text: 'Pasted content' } }} renderData={renderFlagPart} />)
    expect(screen.getByTestId('data-paste')).toBeTruthy()
    rerender(<MessagePart part={{ type: 'data-page-context', data: { tabId: 1, url: 'https://example.com', title: 'Example', content: 'Page content' } }} renderData={renderFlagPart} />)
    expect(screen.getByTestId('data-page-context')).toBeTruthy()
    rerender(<MessagePart part={{ type: 'data-prompt', data: { id: 'prompt-1', title: 'Reusable prompt' } }} renderData={renderFlagPart} />)
    expect(screen.getByTestId('data-prompt')).toBeTruthy()
  })

  it('preserves data-paste while stripping unknown standard-part fields', async () => {
    const { renderFlagPart } = await loadFlagParts()
    expect(renderFlagPart).toBeTypeOf('function')
    const paste = { type: 'data-paste' as const, data: { text: 'Pasted content', filename: 'pasted.txt' } }
    const flaggedText = { type: 'text' as const, text: 'x', flag: 'paste' }
    const messages = await validateChatMessages([
      { id: 'paste', role: 'user', parts: [paste] },
      { id: 'text', role: 'user', parts: [flaggedText] },
    ])
    expect(messages[0]?.parts[0]).toEqual(paste)
    expect(messages[1]?.parts[0]).toEqual({ type: 'text', text: 'x' })
  })
})

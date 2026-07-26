import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ChatShell } from './chat-shell'
import { ChatStatus } from './chat-status'
import { deriveThreadTitle, ThreadHistory } from './thread-history'

describe('provider-free chat shell', () => {
  it('selects history and exposes active state', () => {
    const onThreadChange = vi.fn()
    render(<ThreadHistory threads={[{ id: 1, agent: 'a', title: 'First' }, { id: 2, agent: 'a' }]} activeThreadId={1} fallbackTitle="Untitled" onThreadChange={onThreadChange} renderActions={() => <button>Actions</button>} />)
    expect(screen.getByText('First').getAttribute('aria-current')).toBe('page')
    fireEvent.click(screen.getByText('Untitled'))
    expect(onThreadChange).toHaveBeenCalledWith(2)
  })

  it('derives and truncates a title from the first user message', () => {
    expect(deriveThreadTitle([{ id: '1', role: 'assistant', parts: [{ type: 'text', text: 'Ignore' }] }, { id: '2', role: 'user', parts: [{ type: 'text', text: 'A title that is too long' }] }], 'Fallback', 12)).toBe('A title tha…')
    expect(deriveThreadTitle([], 'Fallback')).toBe('Fallback')
  })

  it('renders shell and injected status content without a provider', () => {
    render(<ChatShell sidebar="History" panel="Panel"><ChatStatus error={new Error('failure')} errorContent={(error) => <span>{error.message}</span>} warningContent="Warning" /></ChatShell>)
    expect(screen.getByText('History')).toBeTruthy()
    expect(screen.getByText('Panel')).toBeTruthy()
    expect(screen.getByText('failure')).toBeTruthy()
    expect(screen.getByText('Warning')).toBeTruthy()
  })
})

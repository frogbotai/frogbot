import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Composer } from './composer'

describe('Composer', () => {
  it('submits with Enter, preserves Shift+Enter, and renders slots', () => {
    const onSubmit = vi.fn()
    render(<Composer aria-label="Message" onSubmit={onSubmit} startSlot={<span>start</span>} endSlot={<span>end</span>} submitContent="Send" stopContent="Stop" />)
    const input = screen.getByLabelText('Message')
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('Hello')
    expect(screen.getByText('start')).toBeTruthy()
    expect(screen.getByText('end')).toBeTruthy()
  })

  it('stops while pending', () => {
    const onStop = vi.fn()
    render(<Composer pending onStop={onStop} onSubmit={vi.fn()} submitContent="Send" stopContent="Stop" />)
    fireEvent.click(screen.getByText('Stop'))
    expect(onStop).toHaveBeenCalledOnce()
  })

  it('supports a controlled value', () => {
    const onValueChange = vi.fn()
    render(<Composer aria-label="Message" value="Controlled" onValueChange={onValueChange} onSubmit={vi.fn()} submitContent="Send" stopContent="Stop" />)
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Next' } })
    expect(onValueChange).toHaveBeenCalledWith('Next')
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Controlled')
  })
})

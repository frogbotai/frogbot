import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MessageActions } from './message-actions'
import { MessageEditor } from './message-editor'

describe('message controls', () => {
  it('delegates copy, regenerate, and edit actions', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const regenerate = vi.fn()
    const edit = vi.fn()
    render(<MessageActions text="Answer" onRegenerate={regenerate} onEdit={edit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(writeText).toHaveBeenCalledWith('Answer')
    expect(regenerate).toHaveBeenCalledOnce()
    expect(edit).toHaveBeenCalledOnce()
  })

  it('edits and resubmits without owning chat state', () => {
    const submit = vi.fn()
    render(<MessageEditor initialValue="Original" onSubmit={submit} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit message' }), { target: { value: 'Revised' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(submit).toHaveBeenCalledWith('Revised')
  })
})

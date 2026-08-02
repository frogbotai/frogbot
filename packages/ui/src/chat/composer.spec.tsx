import { createFrogbotSDK } from '@frogbotai/sdk'
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
    expect(onSubmit).toHaveBeenCalledWith('Hello', [])
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

  it('shows drag and disabled states without accepting files', () => {
    const { container, rerender } = render(<Composer aria-label="Message" onSubmit={vi.fn()} submitContent="Send" stopContent="Stop" />)
    const form = container.querySelector('form') as HTMLFormElement
    fireEvent.dragEnter(form)
    expect(container.querySelector('.gradient-wrapper')?.classList).toContain('gradient-wrapper-dragging')
    fireEvent.drop(form, { dataTransfer: { files: [new File(['x'], 'x.txt')] } })
    expect(container.querySelector('.gradient-wrapper')?.classList).not.toContain('gradient-wrapper-dragging')

    rerender(<Composer aria-label="Message" disabled defaultValue="Hello" onSubmit={vi.fn()} submitContent="Send" stopContent="Stop" />)
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).disabled).toBe(true)
  })

  it('uploads dropped files immediately and submits stable references', async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({ id: 'file-1', filename: 'notes.txt', mimeType: 'text/plain' })))
    const onSubmit = vi.fn()
    const { container } = render(<Composer aria-label="Message" sdk={createFrogbotSDK({ baseURL: '/api', fetch })} filesSlug="documents" onSubmit={onSubmit} submitContent="Send" stopContent="Stop" />)

    fireEvent.drop(container.querySelector('form') as HTMLFormElement, { dataTransfer: { files: [new File(['notes'], 'notes.txt', { type: 'text/plain' })] } })

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/documents')
    await screen.findByRole('button', { name: 'Send' })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSubmit).toHaveBeenCalledWith('', [{ id: 'file-1', filename: 'notes.txt', mediaType: 'text/plain' }])
    expect(JSON.stringify(onSubmit.mock.calls)).not.toContain('base64')
  })

  it('shows upload errors and retries', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('failed', { status: 500, statusText: 'Failed' }))
      .mockResolvedValueOnce(Response.json({ id: 'file-2', filename: 'retry.txt', mimeType: 'text/plain' }))
    const { container } = render(<Composer sdk={createFrogbotSDK({ baseURL: '/api', fetch })} filesSlug="files" onSubmit={vi.fn()} submitContent="Send" stopContent="Stop" />)

    fireEvent.drop(container.querySelector('form') as HTMLFormElement, { dataTransfer: { files: [new File(['retry'], 'retry.txt', { type: 'text/plain' })] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Retry retry.txt' }))

    await screen.findByRole('button', { name: 'Send' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

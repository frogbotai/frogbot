import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '../components/tooltip'

async function loadPageContextButton() {
  return (await import('./page-context-button')).PageContextButton
}

const tab = { active: true, id: 1, title: 'Example tab', url: 'https://example.com' }

describe('PageContextButton', () => {
  it('opens, toggles, and closes the tab menu', async () => {
    const PageContextButton = await loadPageContextButton()
    const addPageContext = vi.fn()
    render(<TooltipProvider><PageContextButton isLoading={false} getOpenTabs={vi.fn().mockResolvedValue({ success: true, tabs: [tab] })} addPageContext={addPageContext} removePageContext={vi.fn()} selectedTabIds={new Set()} /><button>Outside</button></TooltipProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Add tab context' }))
    fireEvent.click(await screen.findByText('Example tab'))
    expect(addPageContext).toHaveBeenCalledWith(1)
    fireEvent.mouseDown(document.body)
    await waitFor(() => expect(screen.queryByText('Example tab')).toBeNull())
  })

  it('removes selected tab context', async () => {
    const PageContextButton = await loadPageContextButton()
    const addPageContext = vi.fn()
    const removePageContext = vi.fn()
    render(<TooltipProvider><PageContextButton isLoading={false} getOpenTabs={vi.fn().mockResolvedValue({ success: true, tabs: [tab] })} addPageContext={addPageContext} removePageContext={removePageContext} selectedTabIds={new Set([1])} /></TooltipProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Add tab context' }))
    fireEvent.click(await screen.findByText('Example tab'))
    expect(removePageContext).toHaveBeenCalledWith(1)
    expect(addPageContext).not.toHaveBeenCalled()
  })

  it('keeps the menu closed when loading tabs fails', async () => {
    const PageContextButton = await loadPageContextButton()
    render(<TooltipProvider><PageContextButton isLoading={false} getOpenTabs={vi.fn().mockResolvedValue({ success: false })} addPageContext={vi.fn()} removePageContext={vi.fn()} selectedTabIds={new Set()} /></TooltipProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Add tab context' }))
    await waitFor(() => expect(screen.queryByText('Add tabs')).toBeNull())
  })

  it('disables the trigger while loading', async () => {
    const PageContextButton = await loadPageContextButton()
    render(<TooltipProvider><PageContextButton isLoading getOpenTabs={vi.fn()} addPageContext={vi.fn()} removePageContext={vi.fn()} selectedTabIds={new Set()} /></TooltipProvider>)
    expect((screen.getByRole('button', { name: 'Add tab context' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

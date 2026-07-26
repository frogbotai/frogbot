import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Sidebar, SidebarProvider, SidebarTrigger } from '../index'

describe('Sidebar', () => {
  it('toggles from its trigger', () => {
    vi.stubGlobal('matchMedia', () => ({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() }))
    render(<SidebarProvider><SidebarTrigger /><Sidebar>Navigation</Sidebar></SidebarProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }))
    expect(screen.getByText('Navigation').getAttribute('data-closed')).toBe('true')
  })

  it('toggles with the platform hotkey', () => {
    vi.stubGlobal('matchMedia', () => ({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() }))
    render(<SidebarProvider><Sidebar>Navigation</Sidebar></SidebarProvider>)
    fireEvent.keyDown(document, { key: 'b', ctrlKey: true })
    expect(screen.getByText('Navigation').getAttribute('data-closed')).toBe('true')
  })
})

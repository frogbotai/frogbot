import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ThemeProvider, ThemeScript, useTheme } from './provider'

function Toggle() {
  const { resolvedMode, setMode } = useTheme()
  return <button onClick={() => setMode('dark')}>{resolvedMode}</button>
}

describe('ThemeProvider', () => {
  it('applies runtime tokens and persists mode changes', () => {
    vi.stubGlobal('matchMedia', () => ({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() }))
    const storage = { get: vi.fn(() => null), set: vi.fn() }
    const { container } = render(<ThemeProvider storage={storage} theme={{ '--primary': 'oklch(0.5 0.2 150)' }}><Toggle /></ThemeProvider>)
    expect(container.firstElementChild?.getAttribute('style')).toContain('--primary')
    fireEvent.click(screen.getByRole('button'))
    expect(storage.set).toHaveBeenCalledWith('fb-ui-theme', 'dark')
    expect(container.firstElementChild?.getAttribute('data-theme')).toBe('dark')
  })

  it('reads stored mode before paint and keeps runtime branding', () => {
    vi.stubGlobal('matchMedia', () => ({ addEventListener: vi.fn(), matches: true, removeEventListener: vi.fn() }))
    const storage = { get: vi.fn(() => 'dark' as const), set: vi.fn() }
    const { container } = render(<ThemeProvider brand={{ tokens: { '--primary': 'oklch(0.4 0.2 120)' } }} storage={storage}><Toggle /></ThemeProvider>)
    expect(container.firstElementChild?.getAttribute('data-theme')).toBe('dark')
    expect(container.firstElementChild?.getAttribute('style')).toContain('oklch(0.4 0.2 120)')
  })

  it('emits a pre-hydration stored-theme bootstrap', () => {
    const { container } = render(<ThemeScript storageKey="custom-theme" />)
    expect(container.querySelector('script')?.textContent).toContain('custom-theme')
    expect(container.querySelector('script')?.textContent).toContain('dataset.fbTheme')
  })

  it('re-skins from config and runtime tokens without component changes', () => {
    vi.stubGlobal('matchMedia', () => ({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() }))
    const { container, rerender } = render(<ThemeProvider mode="light" theme={{ '--primary': 'red' }}><button>Action</button></ThemeProvider>)
    const surface = container.firstElementChild
    const action = screen.getByRole('button')

    expect(surface?.getAttribute('style')).toContain('--primary: red')
    rerender(<ThemeProvider mode="light" theme={{ '--primary': 'blue' }}><button>Action</button></ThemeProvider>)
    expect(surface?.getAttribute('style')).toContain('--primary: blue')
    expect(screen.getByRole('button')).toBe(action)
  })
})

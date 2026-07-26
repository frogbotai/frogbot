import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Markdown } from './markdown'

describe('Markdown', () => {
  it('renders basic formatting and blocks raw HTML', () => {
    const { container } = render(<Markdown>{'## Title\n\n**bold** `code` <script>alert(1)</script>'}</Markdown>)
    expect(screen.getByRole('heading', { name: 'Title' })).toBeTruthy()
    expect(container.querySelector('strong')?.textContent).toBe('bold')
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText(/<script>/)).toBeTruthy()
  })

  it('rejects unsafe link protocols', () => {
    const { container } = render(<Markdown>{'[bad](javascript:alert) [good](https://example.com)'}</Markdown>)
    expect(container.querySelectorAll('a')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'good' }).getAttribute('href')).toBe('https://example.com')
  })
})

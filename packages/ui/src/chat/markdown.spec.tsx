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

  it('renders ordered lists', () => {
    const { container } = render(<Markdown>{'1. one\n2. two'}</Markdown>)
    const list = container.querySelector('ol')
    expect(list?.classList.contains('list-decimal')).toBe(true)
    expect(list?.querySelectorAll(':scope > li')).toHaveLength(2)
  })

  it('renders nested lists', () => {
    const { container } = render(<Markdown>{'- outer\n  - inner'}</Markdown>)
    expect(container.querySelector('li > ul')).not.toBeNull()
  })

  it('renders blockquotes', () => {
    const { container } = render(<Markdown>{'> quoted'}</Markdown>)
    const blockquote = container.querySelector('blockquote')
    expect(blockquote?.classList.contains('border-brand-400')).toBe(true)
    expect(blockquote?.classList.contains('italic')).toBe(true)
    expect(blockquote?.textContent).not.toContain('>')
  })

  it('renders GFM tables', () => {
    const { container } = render(<Markdown>{'| A | B |\n| - | - |\n| 1 | 2 |'}</Markdown>)
    const table = container.querySelector('table')
    expect(table?.querySelector('thead')).not.toBeNull()
    expect(table?.querySelectorAll('th')).toHaveLength(2)
    expect(table?.parentElement?.classList.contains('border-base-300')).toBe(true)
    expect(table?.parentElement?.classList.contains('overflow-x-auto')).toBe(true)
  })

  it('renders horizontal rules', () => {
    const { container } = render(<Markdown>---</Markdown>)
    expect(container.querySelector('hr')?.className).toBe('border-base-200 my-4 w-full')
  })

  it('renders strikethrough', () => {
    const { container } = render(<Markdown>~~removed~~</Markdown>)
    expect(container.querySelector('.line-through')?.textContent).toBe('removed')
  })

  it('renders h4 through h6 typography', () => {
    render(<Markdown>{'#### h4\n\n##### h5\n\n###### h6'}</Markdown>)
    expect(screen.getByRole('heading', { level: 4 }).classList.contains('text-lg')).toBe(true)
    expect(screen.getByRole('heading', { level: 5 }).classList.contains('text-base')).toBe(true)
    expect(screen.getByRole('heading', { level: 6 }).classList.contains('text-sm')).toBe(true)
  })

  it('rejects data link protocols', () => {
    const { container } = render(<Markdown>{'[bad](data:text/html,hello)'}</Markdown>)
    expect(container.querySelector('a')).toBeNull()
  })

  it('renders safe links with Firmware typography', () => {
    render(<Markdown>{'[safe](https://example.com)'}</Markdown>)
    const link = screen.getByRole('link', { name: 'safe' })
    expect(link.classList.contains('text-blue-600')).toBe(true)
    expect(link.classList.contains('hover:underline')).toBe(true)
    expect(link.classList.contains('underline')).toBe(false)
  })

  it('renders inline code without a code block wrapper', () => {
    const { container } = render(<Markdown>{'Use `x` here'}</Markdown>)
    expect(container.querySelector('pre')).toBeNull()
    expect(container.querySelector('code')?.className).toBe('rounded bg-muted px-1 py-0.5 font-mono text-sm')
  })

  it('preserves plain text line breaks', () => {
    const { container } = render(<Markdown>{'first\nsecond'}</Markdown>)
    expect(container.querySelector('br')).not.toBeNull()
  })
})

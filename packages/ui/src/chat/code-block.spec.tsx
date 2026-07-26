import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CodeBlock } from './code-block'

describe('CodeBlock', () => {
  it('renders code literally with its language', () => {
    const { container } = render(<CodeBlock code={'<script>bad()</script>'} language="html" />)
    expect(screen.getByText('<script>bad()</script>')).toBeTruthy()
    expect(container.querySelector('pre')?.dataset.language).toBe('html')
    expect(container.querySelector('script')).toBeNull()
  })
})

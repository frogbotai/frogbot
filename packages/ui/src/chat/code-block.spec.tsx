import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '../theme/provider'
import { CodeBlock } from './code-block'
import { Message } from './message'
import { MessagePart } from './message-part'

describe('CodeBlock', () => {
  beforeEach(() => vi.stubGlobal('matchMedia', () => ({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() })))

  it('renders code literally with its language', () => {
    const { container } = render(<ThemeProvider mode="light"><CodeBlock code={'<script>bad()</script>'} language="html" /></ThemeProvider>)
    expect(screen.getByText('<script>bad()</script>')).toBeTruthy()
    expect(container.querySelector('pre')?.dataset.language).toBe('html')
    expect(container.querySelector('script')).toBeNull()
  })

  it('uses the user code block background in dark mode', () => {
    const { container } = render(
      <ThemeProvider mode="dark">
        <Message role="user">
          <MessagePart role="user" part={{ type: 'text', text: '```js\nconst x = 1\n```', state: 'done' }} />
        </Message>
      </ThemeProvider>,
    )
    expect(container.querySelector('pre')?.classList.contains('bg-muted-foreground')).toBe(true)
  })
})

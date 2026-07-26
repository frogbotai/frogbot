import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Message } from './message'

describe('Message', () => {
  it('renders role, avatar, content, and actions', () => {
    render(<Message role="assistant" avatar="Bot" actions={<button>Copy</button>}>Hello</Message>)
    expect(screen.getByRole('article').dataset.role).toBe('assistant')
    expect(screen.getByText('Bot')).toBeTruthy()
    expect(screen.getByText('Hello')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
  })
})

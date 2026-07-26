import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ReasoningPart } from './reasoning-part'

describe('ReasoningPart', () => {
  it('opens while streaming and collapses when done', () => {
    const { container, rerender } = render(<ReasoningPart part={{ type: 'reasoning', text: 'Work', state: 'streaming' }} />)
    expect(container.querySelector('details')?.open).toBe(true)
    expect(screen.getByText('Thinking...')).toBeTruthy()
    rerender(<ReasoningPart part={{ type: 'reasoning', text: 'Work', state: 'done' }} />)
    expect(container.querySelector('details')?.open).toBe(false)
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MessagePart } from './message-part'

describe('MessagePart', () => {
  it('renders known and unknown parts without throwing', () => {
    const { rerender } = render(<MessagePart part={{ type: 'text', text: 'Hello' }} />)
    expect(screen.getByText('Hello')).toBeTruthy()
    rerender(<MessagePart part={{ type: 'future-part', payload: true }} />)
    expect(screen.getByText('Unsupported message part: future-part')).toBeTruthy()
  })

  it('supports a custom fallback', () => {
    render(<MessagePart part={{ type: 'custom', kind: 'provider.kind' }} fallback={(part) => <span>{part.type}</span>} />)
    expect(screen.getByText('custom')).toBeTruthy()
  })
})

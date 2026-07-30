import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ArtifactProvider } from './artifact'
import { MessagePart } from './message-part'

describe('data and boundary parts', () => {
  it('renders data by default or through a consumer renderer', () => {
    const part = { type: 'data-weather' as const, data: { temperature: 72 } }
    const { rerender } = render(<MessagePart part={part} />)
    expect(screen.getByText(/"temperature": 72/)).toBeTruthy()
    rerender(<MessagePart part={part} renderData={({ data }) => <span>{String((data as { temperature: number }).temperature)} degrees</span>} />)
    expect(screen.getByText('72 degrees')).toBeTruthy()
  })

  it('renders step boundaries', () => {
    render(<MessagePart part={{ type: 'step-start' }} />)
    expect(screen.getByRole('separator')).toBeTruthy()
  })

  it('streams custom-rendered data into artifacts', () => {
    const onStreamPart = vi.fn()
    render(<ArtifactProvider registry={[{ kind: 'weather', render: () => null, onStreamPart }]}><MessagePart part={{ type: 'data-weather', data: 72 }} renderData={() => <span>Custom</span>} /></ArtifactProvider>)
    expect(screen.getByText('Custom')).toBeTruthy()
    expect(onStreamPart).toHaveBeenCalledOnce()
  })
})

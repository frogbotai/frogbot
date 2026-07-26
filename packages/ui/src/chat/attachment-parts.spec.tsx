import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FilePart } from './file-part'
import { SourcePart } from './source-part'

describe('attachment parts', () => {
  it('renders image and downloadable file variants', () => {
    const { rerender } = render(<FilePart part={{ type: 'file', mediaType: 'image/png', filename: 'chart.png', url: '/chart.png' }} />)
    expect(screen.getByRole('img', { name: 'chart.png' })).toBeTruthy()
    rerender(<FilePart part={{ type: 'reasoning-file', mediaType: 'application/pdf', url: '/reasoning.pdf' }} />)
    expect(screen.getByRole('link', { name: 'Reasoning attachment' })).toBeTruthy()
  })

  it('renders URL and document sources', () => {
    const { rerender } = render(<SourcePart part={{ type: 'source-url', sourceId: '1', url: 'https://example.com', title: 'Example' }} />)
    expect(screen.getByRole('link', { name: 'Example' })).toBeTruthy()
    rerender(<SourcePart part={{ type: 'source-document', sourceId: '2', mediaType: 'text/plain', title: 'Guide', filename: 'guide.txt' }} />)
    expect(screen.getByText('Guide (guide.txt)')).toBeTruthy()
  })
})

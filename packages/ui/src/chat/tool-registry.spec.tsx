import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ToolPart } from './tool-part'
import { resolveToolRenderer, type ToolRenderer } from './tool-registry'

const First = () => <div>first</div>
const Second = () => <div>second</div>

describe('tool registry', () => {
  it('resolves the first exact registration', () => {
    const renderers: ToolRenderer[] = [{ kind: 'search', render: First }, { kind: 'search', render: Second }]
    expect(resolveToolRenderer(renderers, 'search')?.render).toBe(First)
    expect(resolveToolRenderer(renderers, 'Search')).toBeUndefined()
  })

  it('renders unknown tools with the generic fallback', () => {
    render(<ToolPart part={{ type: 'dynamic-tool', toolName: 'external', toolCallId: '1', state: 'input-available', input: { query: 'frog' } }} />)
    expect(screen.getByText('external')).toBeTruthy()
    expect(screen.getByText(/frog/)).toBeTruthy()
  })

  it('can add and remove direct renderers without changing provider hook order', () => {
    const part = { type: 'dynamic-tool' as const, toolName: 'search', toolCallId: '1', state: 'input-available' as const, input: {} }
    const { rerender } = render(<ToolPart part={part} renderers={[{ kind: 'search', render: First }]} />)
    expect(screen.getByText('first')).toBeTruthy()
    rerender(<ToolPart part={part} />)
    expect(screen.getByText('search')).toBeTruthy()
  })
})

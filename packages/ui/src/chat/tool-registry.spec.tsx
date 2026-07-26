import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { resolveToolRenderer, type ToolRenderer } from './tool-registry'
import { ToolPart } from './tool-part'

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
})

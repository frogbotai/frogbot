import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ArtifactProvider, ArtifactStreamPart, ArtifactView } from './artifact'
import { type ArtifactRegistryItem,resolveArtifact } from './artifact-registry'

const First = () => <div>first artifact</div>
const Second = () => <div>second artifact</div>

describe('artifact registry', () => {
  it('resolves the first exact registration', () => {
    const registry: ArtifactRegistryItem[] = [{ kind: 'text', render: First }, { kind: 'text', render: Second }]
    expect(resolveArtifact(registry, 'text')?.render).toBe(First)
    expect(resolveArtifact(registry, 'Text')).toBeUndefined()
  })

  it('renders unknown artifacts without throwing', () => {
    render(<ArtifactProvider><ArtifactView artifact={{ kind: 'external', title: 'External', content: { value: 1 } }} /></ArtifactProvider>)
    expect(screen.getByText('External')).toBeTruthy()
    expect(screen.getByText(/value/)).toBeTruthy()
  })

  it('passes streaming parts to externally registered kinds', async () => {
    const onStreamPart = vi.fn(({ setArtifact, streamPart }) => setArtifact({ kind: 'external', content: streamPart.data }))
    render(<ArtifactProvider registry={[{ kind: 'external', render: First, onStreamPart }]}><ArtifactStreamPart part={{ type: 'data-external', data: 'updated' }} /><ArtifactView /></ArtifactProvider>)
    await waitFor(() => expect(onStreamPart).toHaveBeenCalledOnce())
    expect(screen.getByText('first artifact')).toBeTruthy()
  })
})

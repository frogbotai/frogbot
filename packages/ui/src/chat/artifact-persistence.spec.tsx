import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ArtifactProvider, ArtifactViewer } from './artifact'
import type { ArtifactPersistence } from './artifact-registry'

describe('artifact persistence', () => {
  it('loads and saves through the injected accessor', async () => {
    const artifact = { id: 'a1', kind: 'external', title: 'Loaded artifact', content: 'content' }
    const persistence: ArtifactPersistence = { load: vi.fn(async () => artifact), save: vi.fn(async (value) => value) }
    render(<ArtifactProvider persistence={persistence}><ArtifactViewer id="a1" /></ArtifactProvider>)
    await screen.findAllByText('Loaded artifact')
    expect(persistence.load).toHaveBeenCalledWith('a1')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(persistence.save).toHaveBeenCalledWith(artifact))
  })
})

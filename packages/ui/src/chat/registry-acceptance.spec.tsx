import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ArtifactProvider, ArtifactView, type ArtifactRendererProps } from '../exports/chat-artifacts'
import type { ToolRendererProps } from '../exports/chat-tools'
import { ToolPart } from '../exports/chat'

const CustomTool = ({ part }: ToolRendererProps) => <div>Custom tool: {String(part.output)}</div>
const CustomArtifact = ({ artifact }: ArtifactRendererProps) => <div>Custom artifact: {String(artifact.content)}</div>
describe('external registry acceptance', () => {
  it('uses public tool and artifact registrations without ChatProvider and preserves unknown fallbacks', () => {
    render(
      <>
        <ToolPart renderers={[{ kind: 'lookup', render: CustomTool }]} part={{ type: 'dynamic-tool', toolName: 'lookup', toolCallId: '1', state: 'output-available', input: {}, output: 'result' }} />
        <ArtifactProvider registry={[{ kind: 'chart', render: CustomArtifact }]}>
          <ArtifactView artifact={{ kind: 'chart', content: 'result' }} />
          <ArtifactView artifact={{ kind: 'unknown', title: 'Unknown artifact', content: { safe: true } }} />
        </ArtifactProvider>
      </>,
    )

    expect(screen.getByText('Custom tool: result')).toBeTruthy()
    expect(screen.getByText('Custom artifact: result')).toBeTruthy()
    expect(screen.getByText('Unknown artifact')).toBeTruthy()
    expect(screen.getByText(/safe/)).toBeTruthy()
  })
})

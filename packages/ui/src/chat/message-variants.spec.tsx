import { render } from '@testing-library/react'
import type { UIMessage } from 'ai'
import { describe, expect, it } from 'vitest'

import { MessagePart, type MessagePartValue } from './message-part'
import { messageDocumentToUIMessage } from './messages'

const parts: MessagePartValue[] = [
  { type: 'text', text: 'partial', state: 'streaming' },
  { type: 'reasoning', text: 'thought', state: 'done' },
  { type: 'file', mediaType: 'text/plain', filename: 'a.txt', url: '/a.txt' },
  { type: 'reasoning-file', mediaType: 'application/pdf', url: '/r.pdf' },
  { type: 'source-url', sourceId: 'url', url: 'https://example.com', title: 'Web' },
  { type: 'source-document', sourceId: 'doc', mediaType: 'text/plain', title: 'Doc' },
  { type: 'tool-search', toolCallId: '1', state: 'input-streaming', input: { q: 'a' } },
  { type: 'dynamic-tool', toolName: 'lookup', toolCallId: '2', state: 'approval-requested', input: {}, approval: { id: 'approval' } },
  { type: 'dynamic-tool', toolName: 'lookup', toolCallId: '3', state: 'output-error', input: {}, errorText: 'failed' },
  { type: 'data-status', data: { ready: true } },
  { type: 'custom', kind: 'provider.kind' },
  { type: 'step-start' },
  { type: 'future', value: true },
]

function renderParts(values: MessagePartValue[]) {
  return render(<>{values.map((part, index) => <MessagePart key={index} part={part} />)}</>).container.innerHTML
}

describe('message variant matrix', () => {
  it('renders every v7 variant, streaming state, and unknown parts', () => {
    expect(() => renderParts(parts)).not.toThrow()
  })

  it('renders live and reloaded parts identically', () => {
    const message: UIMessage = { id: '1', role: 'assistant', parts: parts.slice(0, -1) as UIMessage['parts'] }
    const live = renderParts(message.parts)
    const reloaded = renderParts(messageDocumentToUIMessage({ ...message, parts: JSON.parse(JSON.stringify(message.parts)) }).parts)
    expect(reloaded).toBe(live)
  })
})

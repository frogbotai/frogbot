import { render } from '@testing-library/react'
import type { UIMessage } from 'ai'
import { describe, expect, it } from 'vitest'

import { MessageList } from './message-list'
import { messageDocumentToUIMessage, uiMessageToDocument } from './messages'

const conversation: UIMessage[] = [
  { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Summarize the report' }] },
  {
    id: 'assistant-1',
    role: 'assistant',
    parts: [
      { type: 'reasoning', text: 'I should inspect the report.', state: 'done' },
      { type: 'tool-search', toolCallId: 'search-1', state: 'output-available', input: { query: 'report' }, output: { matches: 3 } },
      { type: 'text', text: 'The report has three findings.' },
      { type: 'source-url', sourceId: 'source-1', url: 'https://example.com/report', title: 'Report' },
      { type: 'file', mediaType: 'application/pdf', filename: 'report.pdf', url: '/files/report.pdf' },
    ],
  },
]

describe('chat acceptance', () => {
  it('renders a streamed conversation identically after database round-trip', () => {
    const live = render(<MessageList messages={conversation} />).container.innerHTML
    const documents = conversation.map((message) => uiMessageToDocument(message, 'thread-1'))
    const reloaded = documents.map((message) => messageDocumentToUIMessage(JSON.parse(JSON.stringify(message))))
    const persisted = render(<MessageList messages={reloaded} />).container.innerHTML

    expect(persisted).toBe(live)
  })
})

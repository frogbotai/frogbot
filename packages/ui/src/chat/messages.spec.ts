import { describe, expect, it } from 'vitest'

import { messageDocumentToUIMessage, uiMessageToDocument } from './messages'

describe('message mapping', () => {
  it('matches the live UIMessage shape and coerces ids', () => {
    expect(messageDocumentToUIMessage({ id: 42, role: 'assistant', parts: [{ type: 'text', text: 'hello' }], metadata: { model: 'test' } })).toEqual({
      id: '42', role: 'assistant', parts: [{ type: 'text', text: 'hello' }], metadata: { model: 'test' },
    })
  })

  it('omits null metadata and preserves message ids when persisted', () => {
    const message = { id: 'message-1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'hello' }] }
    expect(messageDocumentToUIMessage({ ...message, metadata: null })).toEqual(message)
    expect(uiMessageToDocument(message, 'thread-1')).toEqual({ ...message, thread: 'thread-1' })
  })
})

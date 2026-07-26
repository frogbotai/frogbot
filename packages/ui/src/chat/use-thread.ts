'use client'

import { useEffect, useState } from 'react'
import type { UIMessage } from 'ai'
import type { ChatPlatformAdapter } from './adapter'
import { messageDocumentToUIMessage, type MessageDocument } from './messages'
import { chatRequest, type PayloadPage } from './rest'

export type UseThreadOptions = {
  adapter: ChatPlatformAdapter
  messagesSlug: string
  threadId?: string | number
  apiBase?: string
}

export async function loadThread({ adapter, messagesSlug, threadId, apiBase = '/api' }: UseThreadOptions): Promise<UIMessage[]> {
  if (threadId === undefined) return []
  const params = new URLSearchParams({ depth: '0', limit: '0', sort: 'createdAt', 'where[thread][equals]': String(threadId) })
  const page = await chatRequest<PayloadPage<MessageDocument>>(adapter, `${apiBase}/${encodeURIComponent(messagesSlug)}?${params}`)
  return page.docs.map(messageDocumentToUIMessage)
}

export function useThread(options: UseThreadOptions) {
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [loadedThreadId, setLoadedThreadId] = useState<string | number>()
  const [error, setError] = useState<Error>()
  const [loading, setLoading] = useState(options.threadId !== undefined)

  useEffect(() => {
    let active = true
    setLoading(options.threadId !== undefined)
    void loadThread(options).then((next) => { if (active) { setMessages(next); setLoadedThreadId(options.threadId); setError(undefined); setLoading(false) } }).catch((value: unknown) => { if (active) { setError(value instanceof Error ? value : new Error(String(value))); setLoading(false) } })
    return () => { active = false }
  }, [options.adapter, options.apiBase, options.messagesSlug, options.threadId])

  return { messages, loadedThreadId, error, loading }
}

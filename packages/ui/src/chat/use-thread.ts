'use client'

import type { FrogBotSDK } from '@frogbotai/sdk'
import type { UIMessage } from 'ai'
import { useEffect, useState } from 'react'

import { type MessageDocument,messageDocumentToUIMessage } from './messages'
import { chatRequest, type PayloadPage } from './rest'

export type UseThreadOptions = {
  sdk: FrogBotSDK
  messagesSlug: string
  threadId?: string | number
}

export async function loadThread({ sdk, messagesSlug, threadId }: UseThreadOptions): Promise<UIMessage[]> {
  if (threadId === undefined) return []
  const params = new URLSearchParams({ depth: '0', limit: '0', sort: 'createdAt', 'where[thread][equals]': String(threadId) })
  const page = await chatRequest<PayloadPage<MessageDocument>>(sdk, `/${encodeURIComponent(messagesSlug)}?${params}`)
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
  }, [options.sdk, options.messagesSlug, options.threadId])

  return { messages, loadedThreadId, error, loading }
}
